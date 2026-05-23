import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	selectedHarnessInstallers,
	type AgentHarnessInstaller,
	type HarnessInstallContext,
	type HarnessRoot,
	type SkillTemplateInstall,
	type SkillTemplateSet,
} from './harnesses';

export const storeDirectoryName = '.sundial';
const sundialInstructionStartMarker = '<!-- sundial:agent-instructions -->';
const sundialInstructionEndMarker = '<!-- /sundial:agent-instructions -->';
const legacySundialInstructionStartMarker = '<!-- sundial:correction-feedback-loop -->';
const legacySundialInstructionEndMarker = '<!-- /sundial:correction-feedback-loop -->';

const directoryLayout = [
	'drs/candidates',
	'drs/accepted',
	'drs/rejected',
	'drs/retired',
	'sessions',
] as const;

const skillTemplateFiles = [
	'decision-aware-design/SKILL.md',
	'decision-aware-implement/SKILL.md',
] as const;

export interface StorePaths {
	readonly root: string;
	readonly store: string;
	readonly config: string;
	readonly domains: string;
}

export type DecisionRecordStatus = 'candidate' | 'accepted' | 'rejected' | 'retired';

export const decisionRecordStatuses = ['candidate', 'accepted', 'rejected', 'retired'] as const satisfies readonly DecisionRecordStatus[];

export interface InitResult {
	readonly paths: StorePaths;
	readonly created: readonly string[];
	readonly existing: readonly string[];
	readonly updated: readonly string[];
}

export interface InitOptions {
	readonly claude?: boolean;
	readonly codex?: boolean;
}

export function getStorePaths(projectRoot: string): StorePaths {
	const root = path.resolve(projectRoot);
	const store = path.join(root, storeDirectoryName);

	return {
		root,
		store,
		config: path.join(store, 'config.json'),
		domains: path.join(store, 'domains.md'),
	};
}

export async function discoverStore(startDirectory: string): Promise<StorePaths | undefined> {
	let current = path.resolve(startDirectory);

	for (;;) {
		const paths = getStorePaths(current);
		if (await pathExists(paths.store)) {
			return paths;
		}

		const parent = path.dirname(current);
		if (parent === current) {
			return undefined;
		}

		current = parent;
	}
}

export async function initStore(projectRoot: string, options: InitOptions = {}): Promise<InitResult> {
	const paths = getStorePaths(projectRoot);
	const created: string[] = [];
	const existing: string[] = [];
	const updated: string[] = [];

	await ensureDirectory(paths.store, created, existing, paths.root);

	for (const relativeDirectory of directoryLayout) {
		await ensureDirectory(path.join(paths.store, relativeDirectory), created, existing, paths.root);
	}

	await ensureFile(paths.config, defaultConfig(), created, existing, paths.root);
	await ensureFile(paths.domains, defaultDomains(), created, existing, paths.root);

	const harnessInstallers = selectedHarnessInstallers(options);
	const context = createHarnessInstallContext(paths, harnessInstallers, created, existing, updated);
	for (const installer of harnessInstallers) {
		await installer.install(context);
	}

	return { paths, created, existing, updated };
}

export async function updateRuntimeAssets(projectRoot: string, options: InitOptions): Promise<InitResult> {
	const paths = getStorePaths(projectRoot);
	const created: string[] = [];
	const existing: string[] = [];
	const updated: string[] = [];

	const harnessInstallers = selectedHarnessInstallers(options);
	const context = createHarnessInstallContext(paths, harnessInstallers, created, existing, updated);
	for (const installer of harnessInstallers) {
		await installer.update(context);
	}

	return { paths, created, existing, updated };
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
}

export async function countDecisionRecords(paths: StorePaths, status: DecisionRecordStatus): Promise<number> {
	const directory = decisionRecordDirectory(paths, status);

	if (!await pathExists(directory)) {
		return 0;
	}

	const entries = await fs.readdir(directory, { withFileTypes: true });
	return entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md')).length;
}

export function decisionRecordDirectory(paths: StorePaths, status: DecisionRecordStatus): string {
	const directoryName = status === 'candidate' ? 'candidates' : status;
	return path.join(paths.store, 'drs', directoryName);
}

async function ensureDirectory(
	directoryPath: string,
	created: string[],
	existing: string[],
	projectRoot: string,
): Promise<void> {
	if (await pathExists(directoryPath)) {
		existing.push(formatRelative(projectRoot, directoryPath));
		return;
	}

	await fs.mkdir(directoryPath, { recursive: true });
	created.push(formatRelative(projectRoot, directoryPath));
}

async function ensureFile(
	filePath: string,
	contents: string,
	created: string[],
	existing: string[],
	projectRoot: string,
): Promise<void> {
	if (await pathExists(filePath)) {
		existing.push(formatRelative(projectRoot, filePath));
		return;
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, contents, 'utf8');
	created.push(formatRelative(projectRoot, filePath));
}

function defaultConfig(): string {
	return `${JSON.stringify({
		version: 1,
		store: storeDirectoryName,
	}, undefined, 2)}\n`;
}

function defaultDomains(): string {
	return [
		'# Sundial Domains',
		'',
		'Domains are broad applicability scopes. Use lowercase dot-separated hierarchy paths. A domain query matches ancestors, the exact domain, and descendants, but not sibling branches.',
		'',
		'## Domains',
		'',
		'### all',
		'',
		'Global guidance that applies across the project.',
		'',
		'### cli',
		'',
		'Command-line behavior and CLI-owned workflows.',
		'',
	].join('\n');
}

function createHarnessInstallContext(
	paths: StorePaths,
	harnessInstallers: readonly AgentHarnessInstaller[],
	created: string[],
	existing: string[],
	updated: string[],
): HarnessInstallContext {
	const processedInstructionTargets = new Set<string>();
	let sharedSkillTargets: Promise<boolean> | undefined;

	async function selectedSkillTemplateSet(input: SkillTemplateInstall): Promise<SkillTemplateSet> {
		sharedSkillTargets ??= selectedHarnessesShareSkillTargets(paths.root, harnessInstallers);
		return await sharedSkillTargets ? 'generic' : input.preferredTemplateSet;
	}

	return {
		async ensureManagedInstructions(target) {
			const rule = await renderTemplate('instructions/agent-instructions.md');
			await ensureManagedInstructionBlock(
				path.join(paths.root, target.relativePath),
				target.title,
				rule,
				created,
				existing,
				updated,
				paths.root,
				processedInstructionTargets,
			);
		},
		async ensureSkillTemplates(input) {
			const templateSet = await selectedSkillTemplateSet(input);
			for (const asset of skillTemplateAssets(input.root, templateSet)) {
				await ensureFile(path.join(paths.root, asset.relativePath), await renderTemplate(asset.templatePath), created, existing, paths.root);
			}
		},
		async updateSkillTemplates(input) {
			const templateSet = await selectedSkillTemplateSet(input);
			for (const asset of skillTemplateAssets(input.root, templateSet)) {
				await updateFile(path.join(paths.root, asset.relativePath), await renderTemplate(asset.templatePath), created, existing, updated, paths.root);
			}
		},
	};
}

async function ensureManagedInstructionBlock(
	target: string,
	title: string,
	rule: string,
	created: string[],
	existing: string[],
	updated: string[],
	projectRoot: string,
	processedTargets: Set<string>,
): Promise<void> {
	if (!await pathExists(target)) {
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, `# ${title}\n\n${rule}`, 'utf8');
		processedTargets.add(await physicalPathIdentity(target));
		created.push(formatRelative(projectRoot, target));
		return;
	}

	const identity = await physicalPathIdentity(target);
	if (processedTargets.has(identity)) {
		const current = await fs.readFile(target, 'utf8');
		const repaired = repairManagedInstructionBlock(current, rule);
		if (repaired === current) {
			existing.push(formatRelative(projectRoot, target));
			return;
		}

		await fs.writeFile(target, repaired, 'utf8');
		updated.push(formatRelative(projectRoot, target));
		return;
	}

	const current = await fs.readFile(target, 'utf8');
	const repaired = repairManagedInstructionBlock(current, rule);
	if (repaired === current) {
		processedTargets.add(identity);
		existing.push(formatRelative(projectRoot, target));
		return;
	}

	await fs.writeFile(target, repaired, 'utf8');
	processedTargets.add(await physicalPathIdentity(target));
	updated.push(formatRelative(projectRoot, target));
}

function repairManagedInstructionBlock(current: string, rule: string): string {
	const marker = findManagedInstructionMarker(current);
	const start = marker.start;
	if (start === -1) {
		const separator = current.endsWith('\n') ? '\n' : '\n\n';
		return `${current}${separator}${rule}`;
	}

	const end = current.indexOf(marker.endMarker, start);
	if (end === -1) {
		return `${current.slice(0, start)}${rule}`;
	}

	const endAfterMarker = end + marker.endMarker.length;
	const afterEnd = current.slice(endAfterMarker).startsWith('\n')
		? current.slice(endAfterMarker + 1)
		: current.slice(endAfterMarker);
	return `${current.slice(0, start)}${rule}${afterEnd}`;
}

function findManagedInstructionMarker(current: string): { readonly start: number; readonly endMarker: string } {
	const start = current.indexOf(sundialInstructionStartMarker);
	if (start !== -1) {
		return { start, endMarker: sundialInstructionEndMarker };
	}

	return {
		start: current.indexOf(legacySundialInstructionStartMarker),
		endMarker: legacySundialInstructionEndMarker,
	};
}

async function selectedHarnessesShareSkillTargets(
	projectRoot: string,
	harnessInstallers: readonly AgentHarnessInstaller[],
): Promise<boolean> {
	if (harnessInstallers.length < 2) {
		return false;
	}

	for (const skillFile of skillTemplateFiles) {
		const identities = new Map<string, HarnessRoot>();
		for (const installer of harnessInstallers) {
			const skillPath = path.join(projectRoot, installer.root, 'skills', ...skillFile.split('/'));
			const identity = await physicalPathIdentity(skillPath);
			const existingRoot = identities.get(identity);
			if (existingRoot !== undefined && existingRoot !== installer.root) {
				return true;
			}

			identities.set(identity, installer.root);
		}
	}

	return false;
}

async function physicalPathIdentity(filePath: string): Promise<string> {
	const missingParts: string[] = [];
	let current = path.resolve(filePath);

	for (;;) {
		try {
			return path.join(await fs.realpath(current), ...missingParts.reverse());
		} catch (error) {
			if (!isNodeError(error) || error.code !== 'ENOENT') {
				throw error;
			}
		}

		const parent = path.dirname(current);
		if (parent === current) {
			return path.resolve(filePath);
		}

		missingParts.push(path.basename(current));
		current = parent;
	}
}

async function updateFile(
	filePath: string,
	contents: string,
	created: string[],
	existing: string[],
	updated: string[],
	projectRoot: string,
): Promise<void> {
	if (!await pathExists(filePath)) {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, contents, 'utf8');
		created.push(formatRelative(projectRoot, filePath));
		return;
	}

	const current = await fs.readFile(filePath, 'utf8');
	if (current === contents) {
		existing.push(formatRelative(projectRoot, filePath));
		return;
	}

	await fs.writeFile(filePath, contents, 'utf8');
	updated.push(formatRelative(projectRoot, filePath));
}

function skillTemplateAssets(root: HarnessRoot, templateSet: SkillTemplateSet): readonly RuntimeTemplateAsset[] {
	return skillTemplateFiles.map(skillFile => ({
		relativePath: `${root}/skills/${skillFile}`,
		templatePath: `skills/${templateSet}/${skillFile}`,
	}));
}

const templateIncludes: Readonly<Record<string, string>> = {
	crHowTo: 'include/crHowTo.md',
};

export async function readAgentInstructionsBody(): Promise<string> {
	const rendered = await renderTemplate('instructions/agent-instructions.md');
	return rendered
		.replace(new RegExp(`^${escapeRegExp(sundialInstructionStartMarker)}\\n?`), '')
		.replace(new RegExp(`${escapeRegExp(sundialInstructionEndMarker)}\\n?$`), '')
		.trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function renderTemplate(relativePath: string, seen: readonly string[] = []): Promise<string> {
	if (seen.includes(relativePath)) {
		throw new Error(`Circular Sundial template include: ${[...seen, relativePath].join(' -> ')}`);
	}

	let contents = await readTemplate(relativePath);
	for (const [name, includePath] of Object.entries(templateIncludes)) {
		const token = `{{${name}}}`;
		if (contents.includes(token)) {
			const include = (await renderTemplate(includePath, [...seen, relativePath])).trimEnd();
			contents = contents.replaceAll(token, include);
		}
	}

	return ensureTrailingNewline(contents);
}

async function readTemplate(relativePath: string): Promise<string> {
	const errors: string[] = [];
	for (const candidate of templatePathCandidates(relativePath)) {
		try {
			return await fs.readFile(candidate, 'utf8');
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				errors.push(candidate);
				continue;
			}

			throw error;
		}
	}

	throw new Error(`Sundial template not found: ${relativePath} (searched ${errors.join(', ')})`);
}

function templatePathCandidates(relativePath: string): readonly string[] {
	const parts = relativePath.split('/');
	return [
		path.join(__dirname, 'templates', ...parts),
		path.join(__dirname, '..', 'src', 'core', 'templates', ...parts),
		path.join(__dirname, '..', '..', 'src', 'core', 'templates', ...parts),
	];
}

function ensureTrailingNewline(contents: string): string {
	return contents.endsWith('\n') ? contents : `${contents}\n`;
}

function formatRelative(projectRoot: string, targetPath: string): string {
	const relativePath = path.relative(projectRoot, targetPath);
	return relativePath.length === 0 ? '.' : relativePath.split(path.sep).join('/');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}

interface RuntimeTemplateAsset {
	readonly relativePath: string;
	readonly templatePath: string;
}
