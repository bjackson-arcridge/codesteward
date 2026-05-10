import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CandidateSummary {
	readonly id: string;
	readonly title: string;
	readonly filePath: string;
}

export interface DecisionRecordSummary {
	readonly id: string;
	readonly title: string;
	readonly filePath: string;
	readonly domain: string;
	readonly tags: readonly string[];
	readonly enabled: boolean;
}

export type DecisionRecordSummaryStatus = 'accepted' | 'rejected' | 'retired';

export async function discoverSundialRoot(startDirectory: string): Promise<string | undefined> {
	let current = path.resolve(startDirectory);

	for (;;) {
		if (await directoryExists(path.join(current, '.sundial'))) {
			return current;
		}

		const parent = path.dirname(current);
		if (parent === current) {
			return undefined;
		}

		current = parent;
	}
}

export async function listCandidateSummaries(workspaceRoot: string): Promise<readonly CandidateSummary[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return [];
	}

	const records = await listMarkdownRecords(path.join(storeRoot, '.sundial', 'drs', 'candidates'), summarizeCandidate);
	return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

export async function listDecisionRecordSummaries(
	workspaceRoot: string,
	status: DecisionRecordSummaryStatus = 'accepted',
): Promise<readonly DecisionRecordSummary[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return [];
	}

	const records = await listMarkdownRecords(path.join(storeRoot, '.sundial', 'drs', status), summarizeDecisionRecord);
	return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

export async function listKnownTags(workspaceRoot: string): Promise<readonly string[]> {
	return listKnownVocabulary(workspaceRoot, 'tags');
}

export async function listKnownDomains(workspaceRoot: string): Promise<readonly string[]> {
	return listKnownVocabulary(workspaceRoot, 'domains');
}

async function listKnownVocabulary(workspaceRoot: string, section: 'domains' | 'tags'): Promise<readonly string[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return [];
	}

	const tagsPath = path.join(storeRoot, '.sundial', 'tags.md');
	let markdown: string;

	try {
		markdown = await fs.readFile(tagsPath, 'utf8');
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}

	return parseVocabularyNames(markdown, section);
}

async function listMarkdownRecords<T>(
	directory: string,
	summarize: (filePath: string) => Promise<T>,
): Promise<readonly T[]> {
	let entries: readonly string[];

	try {
		entries = await fs.readdir(directory);
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}

	return Promise.all(entries
		.filter(entry => entry.toLowerCase().endsWith('.md'))
		.map(async entry => summarize(path.join(directory, entry))));
}

async function summarizeCandidate(filePath: string): Promise<CandidateSummary> {
	const markdown = await fs.readFile(filePath, 'utf8');
	const frontmatter = parseFrontmatterBlock(markdown).scalars;
	const id = frontmatter.get('id') ?? path.basename(filePath, '.md');

	return {
		id,
		title: frontmatter.get('title') ?? id,
		filePath,
	};
}

async function summarizeDecisionRecord(filePath: string): Promise<DecisionRecordSummary> {
	const markdown = await fs.readFile(filePath, 'utf8');
	const frontmatter = parseFrontmatterBlock(markdown);
	const id = frontmatter.scalars.get('id') ?? path.basename(filePath, '.md');

	return {
		id,
		title: frontmatter.scalars.get('title') ?? id,
		filePath,
		domain: frontmatter.scalars.get('domain') ?? 'all',
		tags: frontmatter.lists.get('tags') ?? [],
		enabled: frontmatter.scalars.get('enabled') !== 'false',
	};
}

interface ParsedFrontmatter {
	readonly scalars: Map<string, string>;
	readonly lists: Map<string, readonly string[]>;
}

function parseFrontmatterBlock(markdown: string): ParsedFrontmatter {
	const scalars = new Map<string, string>();
	const lists = new Map<string, string[]>();
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
	if (match === null) {
		return { scalars, lists };
	}

	let currentList: string | undefined;
	for (const line of match[1].split(/\r?\n/)) {
		const listItem = /^\s+-\s*(.*?)\s*$/.exec(line);
		if (listItem !== null && currentList !== undefined) {
			lists.get(currentList)?.push(listItem[1]);
			continue;
		}

		const listKey = /^([A-Za-z0-9_-]+):\s*$/.exec(line);
		if (listKey !== null) {
			currentList = listKey[1];
			lists.set(currentList, []);
			continue;
		}

		const keyValue = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
		if (keyValue !== null && keyValue[2].length > 0) {
			currentList = undefined;
			scalars.set(keyValue[1], keyValue[2]);
		}
	}

	return { scalars, lists };
}

function parseVocabularyNames(markdown: string, section: 'domains' | 'tags'): readonly string[] {
	const lines = markdown.split(/\r?\n/);
	const wantedTitle = section === 'domains' ? 'domains' : 'tags';
	const hasStructuredSections = lines.some(line => /^##\s+(?:Domains|Tags)\s*$/i.test(line));

	if (!hasStructuredSections) {
		if (section === 'domains') {
			return [];
		}

		return lines
			.map(line => /^##\s+([a-z0-9-]+)\s*$/.exec(line)?.[1])
			.filter((tag): tag is string => tag !== undefined);
	}

	const names: string[] = [];
	let inSection = false;
	for (const line of lines) {
		const sectionHeading = /^##\s+(.+?)\s*$/.exec(line);
		if (sectionHeading !== null) {
			inSection = sectionHeading[1].trim().toLowerCase() === wantedTitle;
			continue;
		}

		if (!inSection) {
			continue;
		}

		const entryHeading = /^###\s+([a-z0-9-]+(?:\.[a-z0-9-]+)*)\s*$/.exec(line);
		if (entryHeading !== null) {
			names.push(entryHeading[1]);
		}
	}

	return names;
}

async function directoryExists(directory: string): Promise<boolean> {
	try {
		const stat = await fs.stat(directory);
		return stat.isDirectory();
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}
