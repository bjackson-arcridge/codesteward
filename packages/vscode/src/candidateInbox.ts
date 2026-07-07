import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const storeDirectoryName = 'sundial';
export const defaultSpecLanes = ['Backlog', 'Todo', 'Active', 'Done'] as const;
const defaultSpecSidebarOrder = ['Active', 'Todo', 'Backlog', 'Done', 'Archive'] as const;

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

export interface SpecSidebarGroup {
	readonly status: string;
	readonly specs: readonly SpecSummary[];
}

interface SpecWorkflowStatus {
	readonly name: string;
	readonly kanbanVisible: boolean;
	readonly sidebarVisible: boolean;
}

interface SpecWorkflow {
	readonly statuses: readonly SpecWorkflowStatus[];
	readonly kanbanOrder: readonly string[];
	readonly sidebarOrder: readonly string[];
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

export async function listSidebarSpecSummaries(workspaceRoot: string): Promise<readonly SpecSummary[]> {
	return (await listSidebarSpecGroups(workspaceRoot)).flatMap(group => group.specs);
}

export async function listSidebarSpecGroups(workspaceRoot: string): Promise<readonly SpecSidebarGroup[]> {
	const statuses = await listSpecWorkflowStatuses(workspaceRoot);
	const visibleStatuses = new Set(statuses.filter(status => status.sidebarVisible).map(status => status.name));
	const specs = (await listSpecSummaries(workspaceRoot)).filter(spec => visibleStatuses.has(spec.status));
	const specsByStatus = new Map<string, SpecSummary[]>();
	for (const spec of specs) {
		const group = specsByStatus.get(spec.status) ?? [];
		group.push(spec);
		specsByStatus.set(spec.status, group);
	}

	return (await listSpecWorkflow(workspaceRoot)).sidebarOrder
		.filter(status => visibleStatuses.has(status))
		.flatMap(status => {
			const groupSpecs = specsByStatus.get(status);
			if (groupSpecs === undefined || groupSpecs.length === 0) {
				return [];
			}

			return [{
				status,
				specs: groupSpecs.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
			}];
		});
}

export async function listSpecLanes(workspaceRoot: string): Promise<readonly string[]> {
	const workflow = await listSpecWorkflow(workspaceRoot);
	const visibleStatuses = new Set(workflow.statuses.filter(status => status.kanbanVisible).map(status => status.name));
	return workflow.kanbanOrder.filter(status => visibleStatuses.has(status));
}

async function listSpecWorkflowStatuses(workspaceRoot: string): Promise<readonly SpecWorkflowStatus[]> {
	return (await listSpecWorkflow(workspaceRoot)).statuses;
}

async function listSpecWorkflow(workspaceRoot: string): Promise<SpecWorkflow> {
	const storeRoot = await discoverSundialRoot(workspaceRoot);
	if (storeRoot === undefined) {
		return defaultWorkflowStatuses();
	}

	const workflowPath = path.join(storeRoot, storeDirectoryName, 'specs', 'workflow.yml');
	let contents: string;
	try {
		contents = await fs.readFile(workflowPath, 'utf8');
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return defaultWorkflowStatuses();
		}

		throw error;
	}

	const workflow = parseWorkflow(contents);
	return workflow.statuses.length === 0 ? defaultWorkflowStatuses() : normalizeWorkflow(workflow);
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

function defaultWorkflowStatuses(): SpecWorkflow {
	return {
		kanbanOrder: defaultSpecLanes,
		sidebarOrder: defaultSpecSidebarOrder,
		statuses: [
			...defaultSpecLanes.map(name => ({
				name,
				kanbanVisible: true,
				sidebarVisible: true,
			})),
			{
				name: 'Archive',
				kanbanVisible: false,
				sidebarVisible: true,
			},
		],
	};
}

function parseWorkflow(markdown: string): SpecWorkflow {
	return {
		statuses: parseWorkflowStatuses(markdown),
		kanbanOrder: parseWorkflowOrder(markdown, 'kanban'),
		sidebarOrder: parseWorkflowOrder(markdown, 'sidebar'),
	};
}

function normalizeWorkflow(workflow: SpecWorkflow): SpecWorkflow {
	const statusNames = workflow.statuses.map(status => status.name);
	return {
		statuses: workflow.statuses,
		kanbanOrder: orderedKnownStatuses(workflow.kanbanOrder, statusNames),
		sidebarOrder: orderedKnownStatuses(workflow.sidebarOrder, statusNames),
	};
}

function orderedKnownStatuses(order: readonly string[], statusNames: readonly string[]): readonly string[] {
	const known = new Set(statusNames);
	const ordered: string[] = [];
	for (const status of order.length === 0 ? statusNames : order) {
		if (known.has(status)) {
			pushUnique(ordered, status);
		}
	}

	for (const status of statusNames) {
		pushUnique(ordered, status);
	}

	return ordered;
}

function pushUnique(values: string[], value: string): void {
	if (!values.includes(value)) {
		values.push(value);
	}
}

function parseWorkflowOrder(markdown: string, blockName: 'kanban' | 'sidebar'): readonly string[] {
	const order: string[] = [];
	let inBlock = false;
	let inOrder = false;

	for (const line of markdown.split(/\r?\n/)) {
		if (new RegExp(`^${blockName}:\\s*$`).test(line)) {
			inBlock = true;
			inOrder = false;
			continue;
		}

		if (!inBlock) {
			continue;
		}

		if (line.trim().length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
			break;
		}

		if (/^\s*order:\s*$/.test(line)) {
			inOrder = true;
			continue;
		}

		if (!inOrder) {
			continue;
		}

		const scalarItem = /^\s*-\s+(.+?)\s*$/.exec(line);
		if (scalarItem !== null) {
			pushUnique(order, stripYamlString(scalarItem[1]));
		}
	}

	return order.filter(status => status.length > 0);
}

function parseWorkflowStatuses(markdown: string): readonly SpecWorkflowStatus[] {
	const statuses: SpecWorkflowStatus[] = [];
	let inStatuses = false;
	let current: { name: string; kanbanVisible: boolean; sidebarVisible: boolean } | undefined;
	let visibilityScope: 'kanban' | 'sidebar' | undefined;
	const commit = (): void => {
		if (current !== undefined && current.name.length > 0) {
			statuses.push(current);
		}
	};

	for (const line of markdown.split(/\r?\n/)) {
		if (/^\s*statuses:\s*$/.test(line)) {
			inStatuses = true;
			continue;
		}

		if (!inStatuses) {
			continue;
		}

		if (line.trim().length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
			break;
		}

		const namedItem = /^\s*-\s+name:\s+(.+?)\s*$/.exec(line);
		if (namedItem !== null) {
			commit();
			current = {
				name: stripYamlString(namedItem[1]),
				kanbanVisible: true,
				sidebarVisible: true,
			};
			visibilityScope = undefined;
			continue;
		}

		const scope = /^\s*(kanban|sidebar):\s*$/.exec(line);
		if (scope !== null) {
			visibilityScope = scope[1] as 'kanban' | 'sidebar';
			continue;
		}

		const visible = /^\s*visible:\s*(true|false)\s*$/i.exec(line);
		if (visible !== null && current !== undefined && visibilityScope !== undefined) {
			const value = visible[1].toLowerCase() === 'true';
			if (visibilityScope === 'kanban') {
				current.kanbanVisible = value;
			} else {
				current.sidebarVisible = value;
			}
		}
	}

	commit();
	const names = new Set<string>();
	return statuses.filter(status => {
		if (names.has(status.name)) {
			return false;
		}

		names.add(status.name);
		return true;
	});
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
