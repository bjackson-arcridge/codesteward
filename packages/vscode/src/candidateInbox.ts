import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const storeDirectoryName = 'sundial';
export const defaultSpecLanes = ['Backlog', 'Todo', 'Active', 'Done'] as const;

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

export interface ResearchSummary {
	readonly id: string;
	readonly title: string;
	readonly filePath: string;
	readonly domain: string;
	readonly summary: string;
}

export interface SpecSummary {
	readonly id: string;
	readonly title: string;
	readonly filePath: string;
	readonly status: string;
}

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

export async function listResearchSummaries(workspaceRoot: string): Promise<readonly ResearchSummary[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return [];
	}

	const records = await listMarkdownRecords(path.join(storeRoot, storeDirectoryName, 'research'), summarizeResearch);
	return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

export async function listSpecSummaries(workspaceRoot: string): Promise<readonly SpecSummary[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return [];
	}

	const records = await listMarkdownRecords(path.join(storeRoot, storeDirectoryName, 'specs'), summarizeSpec);
	return [...records]
		.filter(record => path.basename(record.filePath).toLowerCase() !== 'board.md')
		.sort((left, right) => left.id.localeCompare(right.id));
}

export async function listSpecLanes(workspaceRoot: string): Promise<readonly string[]> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return defaultSpecLanes;
	}

	const workflowPath = path.join(storeRoot, storeDirectoryName, 'specs', 'workflow.yml');
	let contents: string;
	try {
		contents = await fs.readFile(workflowPath, 'utf8');
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return defaultSpecLanes;
		}

		throw error;
	}

	const lanes = parseWorkflowLanes(contents);
	return lanes.length === 0 ? defaultSpecLanes : lanes;
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

async function summarizeResearch(filePath: string): Promise<ResearchSummary> {
	const markdown = await fs.readFile(filePath, 'utf8');
	const frontmatter = parseFrontmatterScalars(markdown);
	const id = frontmatter.get('id') ?? path.basename(filePath, '.md');

	return {
		id,
		title: frontmatter.get('title') ?? id,
		filePath,
		domain: frontmatter.get('domain') ?? 'all',
		summary: frontmatter.get('summary') ?? '',
	};
}

async function summarizeSpec(filePath: string): Promise<SpecSummary> {
	const markdown = await fs.readFile(filePath, 'utf8');
	const frontmatter = parseFrontmatterScalars(markdown);
	const id = frontmatter.get('id') ?? path.basename(filePath, '.md');

	return {
		id,
		title: frontmatter.get('title') ?? id,
		filePath,
		status: frontmatter.get('status') ?? 'Backlog',
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

function parseWorkflowLanes(markdown: string): readonly string[] {
	const lanes: string[] = [];
	let inLanes = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (/^\s*lanes:\s*$/.test(line)) {
			inLanes = true;
			continue;
		}

		if (!inLanes) {
			continue;
		}

		const item = /^\s*-\s+(.+?)\s*$/.exec(line);
		if (item !== null) {
			lanes.push(stripYamlString(item[1]));
			continue;
		}

		if (line.trim().length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
			break;
		}
	}

	return [...new Set(lanes.filter(lane => lane.length > 0))];
}

function stripYamlString(value: string): string {
	return value.replace(/^['"]|['"]$/g, '').trim();
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

async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
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
