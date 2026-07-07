import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const storeDirectoryName = 'sundial';

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
	readonly enabled: boolean;
}

export type DecisionRecordSummaryStatus = 'accepted' | 'rejected' | 'retired';

export async function discoverSundialRoot(startDirectory: string): Promise<string | undefined> {
	let current = path.resolve(startDirectory);

	for (;;) {
		if (await directoryExists(path.join(current, storeDirectoryName))) {
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

	const records = await listMarkdownRecords(path.join(storeRoot, storeDirectoryName, 'decisions', 'candidates'), summarizeCandidate);
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

	const records = await listMarkdownRecords(path.join(storeRoot, storeDirectoryName, 'decisions', status), summarizeDecisionRecord);
	return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

export async function listKnownDomains(workspaceRoot: string): Promise<readonly string[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return [];
	}

	const domainsPath = path.join(storeRoot, storeDirectoryName, 'domains.md');
	let markdown: string;

	try {
		markdown = await fs.readFile(domainsPath, 'utf8');
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}

	return parseDomainNames(markdown);
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
	const frontmatter = parseFrontmatterScalars(markdown);
	const id = frontmatter.get('id') ?? path.basename(filePath, '.md');

	return {
		id,
		title: frontmatter.get('title') ?? id,
		filePath,
	};
}

async function summarizeDecisionRecord(filePath: string): Promise<DecisionRecordSummary> {
	const markdown = await fs.readFile(filePath, 'utf8');
	const frontmatter = parseFrontmatterScalars(markdown);
	const id = frontmatter.get('id') ?? path.basename(filePath, '.md');

	return {
		id,
		title: frontmatter.get('title') ?? id,
		filePath,
		domain: frontmatter.get('domain') ?? 'all',
		enabled: frontmatter.get('enabled') !== 'false',
	};
}

function parseFrontmatterScalars(markdown: string): Map<string, string> {
	const scalars = new Map<string, string>();
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
	if (match === null) {
		return scalars;
	}

	for (const line of match[1].split(/\r?\n/)) {
		const keyValue = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
		if (keyValue !== null && keyValue[2].length > 0) {
			scalars.set(keyValue[1], keyValue[2]);
		}
	}

	return scalars;
}

function parseDomainNames(markdown: string): readonly string[] {
	const lines = markdown.split(/\r?\n/);
	const names: string[] = [];
	let inSection = false;
	for (const line of lines) {
		const sectionHeading = /^##\s+(.+?)\s*$/.exec(line);
		if (sectionHeading !== null) {
			inSection = sectionHeading[1].trim().toLowerCase() === 'domains';
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
