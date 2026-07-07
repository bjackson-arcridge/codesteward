import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { renderFrontmatter } from './candidates';
import { type FrontmatterValue } from './dr';
import { type StorePaths } from './store';

export const defaultSpecLanes = ['Backlog', 'Todo', 'Active', 'Done'] as const;
const specsDirectoryName = 'specs';
const workflowFileName = 'workflow.yml';

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

export function specsDirectory(paths: StorePaths): string {
	return path.join(paths.store, specsDirectoryName);
}

export function specsWorkflowPath(paths: StorePaths): string {
	return path.join(specsDirectory(paths), workflowFileName);
}

export function defaultSpecsWorkflow(): string {
	return [
		'lanes:',
		...defaultSpecLanes.map(lane => `  - ${lane}`),
		'',
	].join('\n');
}

export async function readSpecLanes(paths: StorePaths): Promise<readonly string[]> {
	const workflowPath = specsWorkflowPath(paths);
	if (!await fileExists(workflowPath)) {
		return defaultSpecLanes;
	}

	const contents = await fs.readFile(workflowPath, 'utf8');
	const lanes = parseWorkflowLanes(contents);
	return lanes.length === 0 ? defaultSpecLanes : lanes;
}

export async function createSpec(paths: StorePaths, input: SpecCreateInput): Promise<SpecCreateResult> {
	const lanes = await readSpecLanes(paths);
	const status = input.status ?? lanes[0] ?? defaultSpecLanes[0];
	requireValidSpecStatus(status, lanes);

	const id = await nextSpecId(paths);
	const filePath = path.join(specsDirectory(paths), `${id}-${slugify(input.title)}.md`);
	const markdown = renderSpecMarkdown({
		id,
		title: input.title,
		status,
		created: input.created,
		updated: input.created,
		created_by: input.author,
	});

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
	const lanes = await readSpecLanes(paths);
	requireValidSpecStatus(status, lanes);
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

function renderSpecMarkdown(frontmatter: Record<string, FrontmatterValue>): string {
	return [
		renderFrontmatter(frontmatter),
		'',
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
	].join('\n').replace('{{title}}', String(frontmatter.title));
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

function requireValidSpecStatus(status: string, lanes: readonly string[]): void {
	if (!lanes.includes(status)) {
		throw new Error(`Unknown spec status "${status}". Known lanes: ${lanes.join(', ')}.`);
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
