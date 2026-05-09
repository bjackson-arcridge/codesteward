import * as fs from 'node:fs/promises';

export interface TagDefinition {
	readonly name: string;
	readonly description: string;
	readonly line: number;
}

export type DomainDefinition = TagDefinition;

export interface TagVocabulary {
	readonly domains: readonly DomainDefinition[];
	readonly tags: readonly TagDefinition[];
	readonly errors: readonly string[];
}

export interface VocabularyProposals {
	readonly domains: Readonly<Record<string, string>>;
	readonly tags: Readonly<Record<string, string>>;
}

type VocabularySection = 'domains' | 'tags';

const tagNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const domainNamePattern = /^(?:all|[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*)$/;

export async function readTagVocabulary(tagsPath: string): Promise<TagVocabulary> {
	const markdown = await fs.readFile(tagsPath, 'utf8');
	return parseTagVocabulary(markdown);
}

export async function acceptVocabularyProposals(tagsPath: string, proposals: VocabularyProposals): Promise<TagVocabulary> {
	const markdown = await fs.readFile(tagsPath, 'utf8');
	const vocabulary = parseTagVocabulary(markdown);
	let updated = markdown;

	const knownDomains = new Set(vocabulary.domains.map(domain => domain.name));
	knownDomains.add('all');
	const domainEntries = Object.entries(proposals.domains)
		.filter(([name]) => !knownDomains.has(name))
		.map(([name, description]) => ({ name, description }));
	updated = appendEntries(updated, 'Domains', domainEntries);

	const knownTags = new Set(vocabulary.tags.map(tag => tag.name));
	const tagEntries = Object.entries(proposals.tags)
		.filter(([name]) => !knownTags.has(name))
		.map(([name, description]) => ({ name, description }));
	updated = appendEntries(updated, 'Tags', tagEntries);

	const updatedVocabulary = parseTagVocabulary(updated);
	if (updatedVocabulary.errors.length > 0) {
		throw new Error(`Vocabulary proposals failed validation: ${updatedVocabulary.errors.join('; ')}`);
	}

	if (updated !== markdown) {
		await fs.writeFile(tagsPath, updated, 'utf8');
	}

	return updatedVocabulary;
}

export function parseTagVocabulary(markdown: string): TagVocabulary {
	return hasStructuredVocabulary(markdown)
		? parseStructuredVocabulary(markdown)
		: parseLegacyTagVocabulary(markdown);
}

function parseStructuredVocabulary(markdown: string): TagVocabulary {
	const lines = markdown.split(/\r?\n/);
	const domains: DomainDefinition[] = [];
	const tags: TagDefinition[] = [];
	const errors: string[] = [];
	let currentSection: VocabularySection | undefined;
	let current: MutableDefinition | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const sectionHeading = /^##\s+(.+?)\s*$/.exec(line);
		if (sectionHeading !== null) {
			finishCurrent(current, domains, tags);
			current = undefined;

			const section = sectionKey(sectionHeading[1]);
			currentSection = section === 'domains' || section === 'tags' ? section : undefined;
			continue;
		}

		const entryHeading = /^###\s+(.+?)\s*$/.exec(line);
		if (entryHeading !== null && currentSection !== undefined) {
			finishCurrent(current, domains, tags);

			const name = entryHeading[1].trim();
			current = {
				section: currentSection,
				name,
				line: index + 1,
				descriptionLines: [],
			};

			if (currentSection === 'domains' && !domainNamePattern.test(name)) {
				errors.push(`Invalid domain "${name}" at line ${index + 1}; use "all" or lowercase dot-separated kebab-case.`);
			}

			if (currentSection === 'tags' && !tagNamePattern.test(name)) {
				errors.push(`Invalid tag "${name}" at line ${index + 1}; use lowercase kebab-case.`);
			}

			continue;
		}

		if (current !== undefined) {
			current.descriptionLines.push(line);
		}
	}

	finishCurrent(current, domains, tags);

	addDuplicateErrors(domains, 'domain', errors);
	addDuplicateErrors(tags, 'tag', errors);

	return { domains, tags, errors };
}

function parseLegacyTagVocabulary(markdown: string): TagVocabulary {
	const lines = markdown.split(/\r?\n/);
	const tags: TagDefinition[] = [];
	const errors: string[] = [];
	let current: MutableDefinition | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const heading = /^##\s+(.+?)\s*$/.exec(line);

		if (heading !== null) {
			finishCurrent(current, [], tags);

			const name = heading[1].trim();
			current = {
				section: 'tags',
				name,
				line: index + 1,
				descriptionLines: [],
			};

			if (!tagNamePattern.test(name)) {
				errors.push(`Invalid tag "${name}" at line ${index + 1}; use lowercase kebab-case.`);
			}

			continue;
		}

		if (current !== undefined) {
			current.descriptionLines.push(line);
		}
	}

	finishCurrent(current, [], tags);
	addDuplicateErrors(tags, 'tag', errors);

	return { domains: [], tags, errors };
}

function finishDefinition(definition: MutableDefinition): TagDefinition {
	return {
		name: definition.name,
		description: definition.descriptionLines.join('\n').trim(),
		line: definition.line,
	};
}

function finishCurrent(
	current: MutableDefinition | undefined,
	domains: DomainDefinition[],
	tags: TagDefinition[],
): void {
	if (current === undefined) {
		return;
	}

	if (current.section === 'domains') {
		domains.push(finishDefinition(current));
		return;
	}

	tags.push(finishDefinition(current));
}

function addDuplicateErrors(definitions: readonly TagDefinition[], label: string, errors: string[]): void {
	const seen = new Set<string>();
	for (const definition of definitions) {
		if (seen.has(definition.name)) {
			errors.push(`Duplicate ${label} "${definition.name}" at line ${definition.line}.`);
		}

		seen.add(definition.name);
	}
}

function hasStructuredVocabulary(markdown: string): boolean {
	return /^##\s+(?:Domains|Tags)\s*$/im.test(markdown);
}

function appendEntries(
	markdown: string,
	sectionTitle: 'Domains' | 'Tags',
	entries: readonly { readonly name: string; readonly description: string }[],
): string {
	if (entries.length === 0) {
		return markdown;
	}

	const lines = markdown.trimEnd().split(/\r?\n/);
	const sectionIndex = lines.findIndex(line => sectionKey(line.replace(/^##\s+/, '')) === sectionKey(sectionTitle));
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
			`## ${sectionTitle}`,
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

function sectionKey(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, '-');
}

interface MutableDefinition {
	readonly section: VocabularySection;
	readonly name: string;
	readonly line: number;
	readonly descriptionLines: string[];
}
