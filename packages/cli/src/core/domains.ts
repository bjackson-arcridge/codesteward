import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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

export interface DomainSuggestion {
	readonly name: string;
	readonly description: string;
}

export interface DomainDetails extends DomainSuggestion {
	readonly referenceCount: number;
}

export interface DomainsJson {
	readonly version: 1;
	readonly domains: readonly DomainDetails[];
	readonly suggestions: readonly DomainSuggestion[];
}

const domainNamePattern = /^(?:all|[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*)$/;

export const defaultDomainSuggestions: readonly DomainSuggestion[] = [
	{ name: 'api', description: 'Public and internal API contracts and behavior.' },
	{ name: 'cli', description: 'Command-line behavior and CLI-owned workflows.' },
	{ name: 'data', description: 'Data models, persistence, migrations, and storage.' },
	{ name: 'docs', description: 'User and developer documentation.' },
	{ name: 'infrastructure', description: 'Build, deployment, hosting, and operations.' },
	{ name: 'security', description: 'Authentication, authorization, privacy, and security controls.' },
	{ name: 'testing', description: 'Test strategy, harnesses, fixtures, and quality gates.' },
	{ name: 'ui', description: 'User-interface architecture and interaction behavior.' },
];

export async function readDomainVocabulary(domainsPath: string): Promise<DomainVocabulary> {
	const markdown = await fs.readFile(domainsPath, 'utf8');
	return parseDomainVocabulary(markdown);
}

export async function readDomainsJson(domainsPath: string): Promise<DomainsJson> {
	const vocabulary = await readDomainVocabulary(domainsPath);
	assertValidVocabulary(vocabulary);
	const references = await findDomainReferences(domainsPath);
	const known = new Set(vocabulary.domains.map(domain => domain.name));
	return {
		version: 1,
		domains: vocabulary.domains.map(domain => ({
			name: domain.name,
			description: domain.description,
			referenceCount: references.get(domain.name)?.length ?? 0,
		})),
		suggestions: defaultDomainSuggestions.filter(suggestion => !known.has(suggestion.name)),
	};
}

export async function addDomain(domainsPath: string, name: string, description: string): Promise<DomainVocabulary> {
	const vocabulary = await readDomainVocabulary(domainsPath);
	assertValidVocabulary(vocabulary);
	const definition = validateDefinition(name, description);
	if (vocabulary.domains.some(domain => domain.name === definition.name)) {
		throw new Error(`Domain "${definition.name}" already exists.`);
	}
	return writeVocabulary(domainsPath, [...vocabulary.domains, definition]);
}

export async function updateDomain(
	domainsPath: string,
	currentName: string,
	updates: { readonly name?: string; readonly description?: string },
): Promise<DomainVocabulary> {
	const vocabulary = await readDomainVocabulary(domainsPath);
	assertValidVocabulary(vocabulary);
	const current = vocabulary.domains.find(domain => domain.name === currentName);
	if (current === undefined) {
		throw new Error(`Unknown domain "${currentName}".`);
	}
	const next = validateDefinition(updates.name ?? current.name, updates.description ?? current.description);
	if (currentName === 'all' && next.name !== 'all') {
		throw new Error('The permanent "all" domain cannot be renamed.');
	}
	if (next.name !== currentName && vocabulary.domains.some(domain => domain.name === next.name)) {
		throw new Error(`Domain "${next.name}" already exists.`);
	}
	if (next.name !== currentName) {
		await assertDomainUnreferenced(domainsPath, currentName, 'rename');
	}
	return writeVocabulary(domainsPath, vocabulary.domains.map(domain => domain.name === currentName ? next : domain));
}

export async function removeDomain(domainsPath: string, name: string): Promise<DomainVocabulary> {
	if (name === 'all') {
		throw new Error('The permanent "all" domain cannot be removed.');
	}
	const vocabulary = await readDomainVocabulary(domainsPath);
	assertValidVocabulary(vocabulary);
	if (!vocabulary.domains.some(domain => domain.name === name)) {
		throw new Error(`Unknown domain "${name}".`);
	}
	await assertDomainUnreferenced(domainsPath, name, 'remove');
	return writeVocabulary(domainsPath, vocabulary.domains.filter(domain => domain.name !== name));
}

export async function acceptDomainProposals(domainsPath: string, proposals: DomainProposals): Promise<DomainVocabulary> {
	const vocabulary = await readDomainVocabulary(domainsPath);
	assertValidVocabulary(vocabulary);
	const knownDomains = new Set(vocabulary.domains.map(domain => domain.name));
	const additions = Object.entries(proposals.domains)
		.filter(([name]) => !knownDomains.has(name))
		.map(([name, description]) => validateDefinition(name, description));
	if (additions.length === 0) {
		return vocabulary;
	}
	return writeVocabulary(domainsPath, [...vocabulary.domains, ...additions]);
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
			current = { name, line: index + 1, descriptionLines: [] };
			if (!domainNamePattern.test(name)) {
				errors.push(`Invalid domain "${name}" at line ${index + 1}; use "all" or lowercase dot-separated kebab-case.`);
			}
			continue;
		}
		current?.descriptionLines.push(line);
	}

	finishCurrent(current, domains);
	addDuplicateErrors(domains, errors);
	addDescriptionErrors(domains, errors);
	return { domains: sortDefinitions(domains), errors };
}

function finishCurrent(current: MutableDefinition | undefined, domains: DomainDefinition[]): void {
	if (current !== undefined) {
		domains.push({
			name: current.name,
			description: current.descriptionLines.join('\n').trim(),
			line: current.line,
		});
	}
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

function addDescriptionErrors(domains: readonly DomainDefinition[], errors: string[]): void {
	for (const domain of domains) {
		if (domain.description.length === 0) {
			errors.push(`Domain "${domain.name}" at line ${domain.line} must have a description.`);
		} else if (/[\r\n]/.test(domain.description)) {
			errors.push(`Domain "${domain.name}" at line ${domain.line} must have a single-line description.`);
		}
	}
}

function validateDefinition(name: string, description: string): DomainDefinition {
	const normalizedName = name.trim();
	const normalizedDescription = description.trim();
	if (!domainNamePattern.test(normalizedName)) {
		throw new Error(`Invalid domain "${normalizedName}"; use "all" or lowercase dot-separated kebab-case.`);
	}
	if (normalizedDescription.length === 0) {
		throw new Error('Domain description must not be empty.');
	}
	if (/[\r\n]/.test(normalizedDescription)) {
		throw new Error('Domain description must be a single line.');
	}
	return { name: normalizedName, description: normalizedDescription, line: 0 };
}

function assertValidVocabulary(vocabulary: DomainVocabulary): void {
	if (vocabulary.errors.length > 0) {
		throw new Error(`Domain vocabulary failed validation: ${vocabulary.errors.join('; ')}`);
	}
}

async function writeVocabulary(domainsPath: string, definitions: readonly DomainDefinition[]): Promise<DomainVocabulary> {
	const markdown = await fs.readFile(domainsPath, 'utf8');
	const rendered = renderDomainSection(markdown, definitions);
	const vocabulary = parseDomainVocabulary(rendered);
	assertValidVocabulary(vocabulary);
	await fs.writeFile(domainsPath, rendered, 'utf8');
	return vocabulary;
}

export function renderDomainSection(markdown: string, definitions: readonly Pick<DomainDefinition, 'name' | 'description'>[]): string {
	const lines = markdown.split(/\r?\n/);
	const sectionIndex = lines.findIndex(line => /^##\s+domains\s*$/i.test(line));
	const nextSectionIndex = sectionIndex === -1
		? -1
		: lines.findIndex((line, index) => index > sectionIndex && /^##\s+/.test(line));
	const before = (sectionIndex === -1 ? lines : lines.slice(0, sectionIndex)).join('\n').trimEnd();
	const after = nextSectionIndex === -1 ? '' : lines.slice(nextSectionIndex).join('\n').trim();
	const entries = sortDefinitions(definitions).map(definition => [
		`### ${definition.name}`,
		'',
		definition.description.trim(),
	].join('\n')).join('\n\n');
	return [before, '## Domains', entries, after].filter(part => part.length > 0).join('\n\n') + '\n';
}

async function assertDomainUnreferenced(domainsPath: string, name: string, operation: 'rename' | 'remove'): Promise<void> {
	const references = (await findDomainReferences(domainsPath)).get(name) ?? [];
	if (references.length > 0) {
		throw new Error(`Cannot ${operation} domain "${name}"; referenced by: ${references.join(', ')}.`);
	}
}

async function findDomainReferences(domainsPath: string): Promise<Map<string, string[]>> {
	const store = path.dirname(domainsPath);
	const root = path.dirname(store);
	const directories = [
		path.join(store, 'decisions', 'candidates'),
		path.join(store, 'decisions', 'accepted'),
		path.join(store, 'decisions', 'rejected'),
		path.join(store, 'decisions', 'retired'),
		path.join(store, 'research'),
	];
	const result = new Map<string, string[]>();
	for (const directory of directories) {
		for (const filePath of await markdownFiles(directory)) {
			const markdown = await fs.readFile(filePath, 'utf8');
			const domain = readFrontmatterDomain(markdown);
			if (domain === undefined) {
				continue;
			}
			const references = result.get(domain) ?? [];
			references.push(path.relative(root, filePath).split(path.sep).join('/'));
			result.set(domain, references);
		}
	}
	for (const references of result.values()) {
		references.sort(compareAscii);
	}
	return result;
}

async function markdownFiles(directory: string): Promise<readonly string[]> {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw error;
	}
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await markdownFiles(entryPath));
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			files.push(entryPath);
		}
	}
	return files.sort(compareAscii);
}

function readFrontmatterDomain(markdown: string): string | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
	if (match === null) {
		return undefined;
	}
	const domain = match[1].split(/\r?\n/)
		.map(line => /^domain:\s*(.*?)\s*$/.exec(line)?.[1])
		.find(value => value !== undefined);
	return domain?.replace(/^(['"])(.*)\1$/, '$2');
}

function sortDefinitions<T extends Pick<DomainDefinition, 'name'>>(definitions: readonly T[]): T[] {
	return [...definitions].sort((left, right) => compareAscii(left.name, right.name));
}

function compareAscii(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

interface MutableDefinition {
	readonly name: string;
	readonly line: number;
	readonly descriptionLines: string[];
}
