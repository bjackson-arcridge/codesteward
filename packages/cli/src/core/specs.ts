import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { renderFrontmatter } from './candidates';
import { type FrontmatterValue } from './dr';
import { type StorePaths } from './store';

export const defaultSpecLanes = ['Backlog', 'Todo', 'Active', 'Done'] as const;
const defaultSpecSidebarOrder = ['Active', 'Todo', 'Backlog', 'Done', 'Archive'] as const;
const specsDirectoryName = 'specs';
const templatesDirectoryName = 'templates';
const specTemplateFileName = 'spec.md';
const workflowFileName = 'workflow.yml';

export interface SpecWorkflowStatus {
	readonly name: string;
	readonly kanbanVisible: boolean;
	readonly sidebarVisible: boolean;
}

export interface SpecWorkflow {
	readonly statuses: readonly SpecWorkflowStatus[];
	readonly kanbanOrder: readonly string[];
	readonly sidebarOrder: readonly string[];
}

export interface SpecRecord {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly filePath: string;
	readonly created?: string;
	readonly updated?: string;
}

export interface SpecCreateInput {
	readonly title: string;
	readonly status?: string;
	readonly author: string;
	readonly created: string;
}

export interface SpecCreateResult {
	readonly spec: SpecRecord;
}

export interface SpecStatusResult {
	readonly spec: SpecRecord;
	readonly previousStatus: string;
}

export interface SpecDeleteResult {
	readonly spec: SpecRecord;
}

export interface SpecTemplateResult {
	readonly filePath: string;
	readonly created: boolean;
}

export function specsDirectory(paths: StorePaths): string {
	return path.join(paths.store, specsDirectoryName);
}

export function specsWorkflowPath(paths: StorePaths): string {
	return path.join(specsDirectory(paths), workflowFileName);
}

export function specTemplatePath(paths: StorePaths): string {
	return path.join(paths.store, templatesDirectoryName, specTemplateFileName);
}

export function defaultSpecTemplate(): string {
	return [
		'# {{title}}',
		'',
		'## Discovery',
		'',
		'## Applicable Decision Records',
		'',
		'## Applicable Research Notes',
		'',
		'## Planned Approach',
		'',
		'## Rejected Alternatives',
		'',
		'## Test Plan',
		'',
		'## Open Questions',
		'',
		'## Implementation Log',
		'',
		'## Test Log',
		'',
	].join('\n');
}

export async function ensureSpecTemplate(paths: StorePaths): Promise<SpecTemplateResult> {
	const filePath = specTemplatePath(paths);
	await fs.mkdir(path.dirname(filePath), { recursive: true });

	try {
		await fs.writeFile(filePath, defaultSpecTemplate(), { encoding: 'utf8', flag: 'wx' });
		return { filePath, created: true };
	} catch (error) {
		if (isNodeError(error) && error.code === 'EEXIST') {
			const stats = await fs.stat(filePath);
			if (!stats.isFile()) {
				throw new Error(`Spec template path is not a file: ${filePath}`);
			}
			return { filePath, created: false };
		}

		throw error;
	}
}

export function defaultSpecsWorkflow(): string {
	return [
		'kanban:',
		'  order:',
		...defaultSpecLanes.map(status => `    - ${status}`),
		'sidebar:',
		'  order:',
		...defaultSpecSidebarOrder.map(status => `    - ${status}`),
		'statuses:',
		...defaultWorkflow().statuses.flatMap(status => [
			`  - name: ${status.name}`,
			'    kanban:',
			`      visible: ${status.kanbanVisible ? 'true' : 'false'}`,
			'    sidebar:',
			`      visible: ${status.sidebarVisible ? 'true' : 'false'}`,
		]),
		'',
	].join('\n');
}

export async function readSpecWorkflow(paths: StorePaths): Promise<SpecWorkflow> {
	const workflowPath = specsWorkflowPath(paths);
	if (!await fileExists(workflowPath)) {
		return defaultWorkflow();
	}

	const contents = await fs.readFile(workflowPath, 'utf8');
	const workflow = parseSpecWorkflow(contents);
	if (workflow.statuses.length === 0) {
		return defaultWorkflow();
	}

	return normalizeWorkflow(workflow);
}

export async function readSpecLanes(paths: StorePaths): Promise<readonly string[]> {
	const workflow = await readSpecWorkflow(paths);
	const visibleStatuses = new Set(workflow.statuses.filter(status => status.kanbanVisible).map(status => status.name));
	return workflow.kanbanOrder.filter(status => visibleStatuses.has(status));
}

export async function readSpecStatuses(paths: StorePaths): Promise<readonly string[]> {
	return (await readSpecWorkflow(paths)).statuses.map(status => status.name);
}

export async function createSpec(paths: StorePaths, input: SpecCreateInput): Promise<SpecCreateResult> {
	const workflow = await readSpecWorkflow(paths);
	const status = input.status ?? workflow.statuses.find(item => item.kanbanVisible)?.name ?? workflow.statuses[0]?.name ?? defaultSpecLanes[0];
	requireValidSpecStatus(status, workflow.statuses.map(item => item.name));

	const id = await nextSpecId(paths);
	const filePath = path.join(specsDirectory(paths), `${id}-${slugify(input.title)}.md`);
	const frontmatter = {
		id,
		title: input.title,
		status,
		created: input.created,
		updated: input.created,
		created_by: input.author,
	};
	const markdown = renderSpecMarkdown(frontmatter, await readSpecTemplate(paths));

	await fs.writeFile(filePath, markdown, 'utf8');
	const spec = await readSpecFile(filePath);
	return { spec };
}

export async function listSpecs(paths: StorePaths): Promise<readonly SpecRecord[]> {
	let entries: readonly string[];
	try {
		entries = await fs.readdir(specsDirectory(paths));
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}

	const records = await Promise.all(entries
		.filter(entry => entry.toLowerCase().endsWith('.md'))
		.filter(entry => entry.toLowerCase() !== 'board.md')
		.map(entry => readSpecFile(path.join(specsDirectory(paths), entry))));

	return records.sort((left, right) => left.id.localeCompare(right.id));
}

export async function findSpec(paths: StorePaths, id: string): Promise<SpecRecord | undefined> {
	const specs = await listSpecs(paths);
	return specs.find(spec => spec.id === id);
}

export async function setSpecStatus(paths: StorePaths, id: string, status: string, updated: string): Promise<SpecStatusResult> {
	const statuses = await readSpecStatuses(paths);
	requireValidSpecStatus(status, statuses);
	const spec = await requireSpec(paths, id);
	const markdown = await fs.readFile(spec.filePath, 'utf8');
	const { frontmatter, body } = parseMarkdownWithFrontmatter(markdown);
	const updatedMarkdown = `${renderFrontmatter({
		...frontmatter,
		status,
		updated,
	})}\n${body.trimStart()}`;

	await fs.writeFile(spec.filePath, updatedMarkdown.endsWith('\n') ? updatedMarkdown : `${updatedMarkdown}\n`, 'utf8');
	const updatedSpec = await readSpecFile(spec.filePath);
	return { spec: updatedSpec, previousStatus: spec.status };
}

export async function deleteSpec(paths: StorePaths, id: string): Promise<SpecDeleteResult> {
	const spec = await requireSpec(paths, id);
	await fs.unlink(spec.filePath);
	return { spec };
}

export async function renderSpecBoard(paths: StorePaths): Promise<string> {
	return renderSpecBoardMarkdown(await listSpecs(paths), await readSpecLanes(paths));
}

async function requireSpec(paths: StorePaths, id: string): Promise<SpecRecord> {
	const spec = await findSpec(paths, id);
	if (spec === undefined) {
		throw new Error(`No spec found with id "${id}".`);
	}

	return spec;
}

async function nextSpecId(paths: StorePaths): Promise<string> {
	const specs = await listSpecs(paths);
	let max = 0;
	for (const spec of specs) {
		if (!spec.id.startsWith('SPEC-')) {
			continue;
		}

		const value = Number(spec.id.slice('SPEC-'.length));
		if (Number.isInteger(value)) {
			max = Math.max(max, value);
		}
	}

	return `SPEC-${String(max + 1).padStart(4, '0')}`;
}

async function readSpecFile(filePath: string): Promise<SpecRecord> {
	const markdown = await fs.readFile(filePath, 'utf8');
	const { frontmatter } = parseMarkdownWithFrontmatter(markdown);
	const id = stringFrontmatter(frontmatter, 'id') || path.basename(filePath, '.md');
	const title = stringFrontmatter(frontmatter, 'title') || id;
	const status = stringFrontmatter(frontmatter, 'status') || defaultSpecLanes[0];

	return {
		id,
		title,
		status,
		filePath,
		created: stringFrontmatter(frontmatter, 'created') || undefined,
		updated: stringFrontmatter(frontmatter, 'updated') || undefined,
	};
}

async function readSpecTemplate(paths: StorePaths): Promise<string> {
	const result = await ensureSpecTemplate(paths);
	return await fs.readFile(result.filePath, 'utf8');
}

function renderSpecMarkdown(frontmatter: Record<string, FrontmatterValue>, template: string): string {
	let body = template;
	for (const [key, value] of Object.entries(frontmatter)) {
		body = body.replaceAll(`{{${key}}}`, () => String(value));
	}

	const markdown = `${renderFrontmatter(frontmatter)}\n\n${body}`;
	return markdown.endsWith('\n') ? markdown : `${markdown}\n`;
}

function renderSpecBoardMarkdown(specs: readonly SpecRecord[], lanes: readonly string[] = defaultSpecLanes): string {
	const lines = ['# Sundial Specs', ''];
	for (const lane of lanes) {
		lines.push(`## ${lane}`, '');
		for (const spec of specs.filter(item => item.status === lane)) {
			lines.push(`### ${spec.title}`);
			lines.push('  - tags: [spec]');
			lines.push('  ```md');
			lines.push(`  [Open spec](./${path.basename(spec.filePath)})`);
			lines.push('  ```');
			lines.push('');
		}
	}

	return lines.join('\n');
}

function defaultWorkflow(): SpecWorkflow {
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

function parseSpecWorkflow(markdown: string): SpecWorkflow {
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

		const scalarItem = /^\s*-\s+(.+?)\s*$/.exec(line);
		if (scalarItem !== null) {
			commit();
			current = {
				name: stripYamlString(scalarItem[1]),
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
	return uniqueStatuses(statuses);
}

function uniqueStatuses(statuses: readonly SpecWorkflowStatus[]): readonly SpecWorkflowStatus[] {
	const names = new Set<string>();
	const unique: SpecWorkflowStatus[] = [];
	for (const status of statuses) {
		if (status.name.length === 0 || names.has(status.name)) {
			continue;
		}

		names.add(status.name);
		unique.push(status);
	}

	return unique;
}

function stripYamlString(value: string): string {
	return value.replace(/^['"]|['"]$/g, '').trim();
}

function requireValidSpecStatus(status: string, lanes: readonly string[]): void {
	if (!lanes.includes(status)) {
		throw new Error(`Unknown spec status "${status}". Known statuses: ${lanes.join(', ')}.`);
	}
}

function parseMarkdownWithFrontmatter(markdown: string): { readonly frontmatter: Record<string, FrontmatterValue>; readonly body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
	if (match === null) {
		return { frontmatter: {}, body: markdown };
	}

	const frontmatter: Record<string, FrontmatterValue> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const keyValue = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
		if (keyValue !== null && keyValue[2].length > 0) {
			frontmatter[keyValue[1]] = keyValue[2];
		}
	}

	return { frontmatter, body: markdown.slice(match[0].length) };
}

function stringFrontmatter(frontmatter: Record<string, FrontmatterValue>, key: string): string {
	const value = frontmatter[key];
	return typeof value === 'string' ? value : '';
}

function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug.length === 0 ? 'spec' : slug;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
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
