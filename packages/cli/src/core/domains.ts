import * as fs from 'node:fs/promises';

export interface DomainDefinition {
	readonly name: string;
	readonly description: string;
	readonly line: number;
}

export interface DomainVocabulary {
	readonly domains: readonly DomainDefinition[];
	readonly errors: readonly string[];
}

export interface DomainProposals {
	readonly domains: Readonly<Record<string, string>>;
}

const domainNamePattern = /^(?:all|[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*)$/;

export async function readDomainVocabulary(domainsPath: string): Promise<DomainVocabulary> {
	const markdown = await fs.readFile(domainsPath, 'utf8');
	return parseDomainVocabulary(markdown);
}

export async function acceptDomainProposals(domainsPath: string, proposals: DomainProposals): Promise<DomainVocabulary> {
	const markdown = await fs.readFile(domainsPath, 'utf8');
	const vocabulary = parseDomainVocabulary(markdown);
	const knownDomains = new Set(vocabulary.domains.map(domain => domain.name));
	knownDomains.add('all');
	const newEntries = Object.entries(proposals.domains)
		.filter(([name]) => !knownDomains.has(name))
		.map(([name, description]) => ({ name, description }));
	const updated = appendDomainEntries(markdown, newEntries);

	const updatedVocabulary = parseDomainVocabulary(updated);
	if (updatedVocabulary.errors.length > 0) {
		throw new Error(`Domain proposals failed validation: ${updatedVocabulary.errors.join('; ')}`);
	}

	if (updated !== markdown) {
		await fs.writeFile(domainsPath, updated, 'utf8');
	}

	return updatedVocabulary;
}

export function parseDomainVocabulary(markdown: string): DomainVocabulary {
	const lines = markdown.split(/\r?\n/);
	const domains: DomainDefinition[] = [];
	const errors: string[] = [];
	let inDomainsSection = false;
	let current: MutableDefinition | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const sectionHeading = /^##\s+(.+?)\s*$/.exec(line);
		if (sectionHeading !== null) {
			finishCurrent(current, domains);
			current = undefined;
			inDomainsSection = sectionHeading[1].trim().toLowerCase() === 'domains';
			continue;
		}

		if (!inDomainsSection) {
			continue;
		}

		const entryHeading = /^###\s+(.+?)\s*$/.exec(line);
		if (entryHeading !== null) {
			finishCurrent(current, domains);

			const name = entryHeading[1].trim();
			current = {
				name,
				line: index + 1,
				descriptionLines: [],
			};

			if (!domainNamePattern.test(name)) {
				errors.push(`Invalid domain "${name}" at line ${index + 1}; use "all" or lowercase dot-separated kebab-case.`);
			}

			continue;
		}

		if (current !== undefined) {
			current.descriptionLines.push(line);
		}
	}

	finishCurrent(current, domains);
	addDuplicateErrors(domains, errors);

	return { domains, errors };
}

function finishCurrent(current: MutableDefinition | undefined, domains: DomainDefinition[]): void {
	if (current === undefined) {
		return;
	}

	domains.push({
		name: current.name,
		description: current.descriptionLines.join('\n').trim(),
		line: current.line,
	});
}

function addDuplicateErrors(domains: readonly DomainDefinition[], errors: string[]): void {
	const seen = new Set<string>();
	for (const domain of domains) {
		if (seen.has(domain.name)) {
			errors.push(`Duplicate domain "${domain.name}" at line ${domain.line}.`);
		}

		seen.add(domain.name);
	}
}

function appendDomainEntries(
	markdown: string,
	entries: readonly { readonly name: string; readonly description: string }[],
): string {
	if (entries.length === 0) {
		return markdown;
	}

	const lines = markdown.trimEnd().split(/\r?\n/);
	const sectionIndex = lines.findIndex(line => /^##\s+domains\s*$/i.test(line));
	const rendered = entries.flatMap(entry => [
		`### ${entry.name}`,
		'',
		entry.description.trim().length === 0 ? `TODO: describe ${entry.name}.` : entry.description.trim(),
		'',
	]);

	if (sectionIndex === -1) {
		return [
			...lines,
			'',
			'## Domains',
			'',
			...rendered,
		].join('\n');
	}

	const nextSectionIndex = lines.findIndex((line, index) => index > sectionIndex && /^##\s+/.test(line));
	const insertIndex = nextSectionIndex === -1 ? lines.length : nextSectionIndex;
	const prefix = lines.slice(0, insertIndex);
	const suffix = lines.slice(insertIndex);

	return [
		...prefix,
		...(prefix[prefix.length - 1]?.trim() === '' ? [] : ['']),
		...rendered,
		...suffix,
	].join('\n');
}

interface MutableDefinition {
	readonly name: string;
	readonly line: number;
	readonly descriptionLines: string[];
}
