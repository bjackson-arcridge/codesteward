import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defaultSpecsWorkflow } from './specs';
import {
	selectedHarnessInstallers,
	type AgentHarnessInstaller,
	type HarnessInstallContext,
	type HarnessRoot,
	type SkillTemplateInstall,
	type SkillTemplateSet,
} from './harnesses';

export const storeDirectoryName = 'sundial';
const defaultStoreFolder = '.';
const sundialInstructionStartMarker = '<!-- sundial:agent-instructions -->';
const sundialInstructionEndMarker = '<!-- /sundial:agent-instructions -->';
const legacySundialInstructionStartMarker = '<!-- sundial:correction-feedback-loop -->';
const legacySundialInstructionEndMarker = '<!-- /sundial:correction-feedback-loop -->';

const directoryLayout = [
	'decisions/candidates',
	'decisions/accepted',
	'decisions/rejected',
	'decisions/retired',
	'docs',
	'research',
	'specs',
	'sessions',
] as const;

const decisionRecordDirectoryKeepFiles = [
	'decisions/candidates/.gitkeep',
	'decisions/accepted/.gitkeep',
	'decisions/rejected/.gitkeep',
	'decisions/retired/.gitkeep',
	'research/.gitkeep',
	'specs/.gitkeep',
] as const;

const storeSeedFiles = [
	['specs/workflow.yml', defaultSpecsWorkflow()] as const,
] as const;

const storeTemplateFiles = [
	['docs/SUNDIAL.md', 'docs/SUNDIAL.md'] as const,
] as const;

const managedStoreTemplateFiles = [
	['SUNDIAL-INSTRUCTIONS.md', 'instructions/SUNDIAL-INSTRUCTIONS.md'] as const,
] as const;

const skillTemplateFiles = [
	'decision-aware-design/SKILL.md',
	'decision-aware-implement/SKILL.md',
	'decision-aware-review/SKILL.md',
	'remember-research/SKILL.md',
] as const;

export interface StorePaths {
	readonly root: string;
	readonly store: string;
	readonly folder: string;
	readonly targetRoot: string;
	readonly config: string;
	readonly domains: string;
	readonly docs: string;
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
	readonly folder?: string;
}

export function getStorePaths(projectRoot: string, folder: string = defaultStoreFolder): StorePaths {
	const root = path.resolve(projectRoot);
	const normalizedFolder = normalizeStoreFolder(folder);
	const store = path.join(root, storeDirectoryName);
	const targetRoot = normalizedFolder === defaultStoreFolder
		? root
		: path.join(root, ...normalizedFolder.split('/'));

	return {
		root,
		store,
		folder: normalizedFolder,
		targetRoot,
		config: path.join(store, 'config.json'),
		domains: path.join(store, 'domains.md'),
		docs: path.join(store, 'docs'),
	};
}

export async function loadStorePaths(projectRoot: string): Promise<StorePaths> {
	const paths = getStorePaths(projectRoot);
	const folder = await readConfiguredStoreFolder(paths.config);
	return getStorePaths(projectRoot, folder);
}

export async function discoverStore(startDirectory: string): Promise<StorePaths | undefined> {
	let current = path.resolve(startDirectory);

	for (;;) {
		const paths = getStorePaths(current);
		if (await pathExists(paths.store)) {
			return await loadStorePaths(current);
		}

		const parent = path.dirname(current);
		if (parent === current) {
			return undefined;
		}

		current = parent;
	}
}

export async function initStore(projectRoot: string, options: InitOptions = {}): Promise<InitResult> {
	const basePaths = getStorePaths(projectRoot);
	const folder = options.folder ?? await readConfiguredStoreFolder(basePaths.config);
	const paths = getStorePaths(projectRoot, folder);
	const created: string[] = [];
	const existing: string[] = [];
	const updated: string[] = [];

	await ensureDirectory(paths.store, created, existing, paths.root);
	await ensureConfiguredTargetDirectory(paths, created, existing);

	for (const relativeDirectory of directoryLayout) {
		await ensureDirectory(path.join(paths.store, relativeDirectory), created, existing, paths.root);
	}

	for (const relativeFile of decisionRecordDirectoryKeepFiles) {
		await ensureFile(path.join(paths.store, relativeFile), keepFileContents(), created, existing, paths.root);
	}

	for (const [relativeFile, contents] of storeSeedFiles) {
		await ensureFile(path.join(paths.store, relativeFile), contents, created, existing, paths.root);
	}

	for (const [relativeFile, templatePath] of storeTemplateFiles) {
		await ensureFile(path.join(paths.store, relativeFile), await renderTemplate(templatePath), created, existing, paths.root);
	}

	for (const [relativeFile, templatePath] of managedStoreTemplateFiles) {
		await ensureFile(path.join(paths.store, relativeFile), await renderTemplate(templatePath), created, existing, paths.root);
	}

	await ensureConfig(paths, options.folder !== undefined, created, existing, updated);
	await ensureFile(paths.domains, defaultDomains(), created, existing, paths.root);

	const harnessInstallers = selectedHarnessInstallers(options);
	const context = createHarnessInstallContext(paths, harnessInstallers, created, existing, updated);
	for (const installer of harnessInstallers) {
		await installer.install(context);
	}

	return { paths, created, existing, updated };
}

export async function updateRuntimeAssets(projectRoot: string, options: InitOptions): Promise<InitResult> {
	const basePaths = await loadStorePaths(projectRoot);
	const paths = options.folder === undefined
		? basePaths
		: getStorePaths(projectRoot, options.folder);
	const created: string[] = [];
	const existing: string[] = [];
	const updated: string[] = [];

	await ensureConfiguredTargetDirectory(paths, created, existing);
	await ensureDirectory(paths.docs, created, existing, paths.root);
	for (const [relativeFile, templatePath] of storeTemplateFiles) {
		await ensureFile(path.join(paths.store, relativeFile), await renderTemplate(templatePath), created, existing, paths.root);
	}
	for (const [relativeFile, templatePath] of managedStoreTemplateFiles) {
		await updateFile(path.join(paths.store, relativeFile), await renderTemplate(templatePath), created, existing, updated, paths.root);
	}

	await ensureConfig(paths, options.folder !== undefined, created, existing, updated);

	const harnessInstallers = selectedHarnessInstallers(options);
	const context = createHarnessInstallContext(paths, harnessInstallers, created, existing, updated);
	for (const installer of harnessInstallers) {
		await installer.update(context);
	}

	return { paths, created, existing, updated };
}

async function ensureConfiguredTargetDirectory(
	paths: StorePaths,
	created: string[],
	existing: string[],
): Promise<void> {
	if (paths.folder === defaultStoreFolder) {
		return;
	}

	await ensureDirectory(paths.targetRoot, created, existing, paths.root);
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
	return path.join(paths.store, 'decisions', directoryName);
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

async function ensureConfig(
	paths: StorePaths,
	updateExisting: boolean,
	created: string[],
	existing: string[],
	updated: string[],
): Promise<void> {
	if (!await pathExists(paths.config)) {
		await fs.mkdir(path.dirname(paths.config), { recursive: true });
		await fs.writeFile(paths.config, defaultConfig(paths.folder), 'utf8');
		created.push(formatRelative(paths.root, paths.config));
		return;
	}

	if (!updateExisting) {
		existing.push(formatRelative(paths.root, paths.config));
		return;
	}

	const current = await fs.readFile(paths.config, 'utf8');
	const currentConfig = parseStoreConfig(current, paths.config);
	const next = `${JSON.stringify({
		...currentConfig,
		version: 1,
		store: storeDirectoryName,
		folder: paths.folder,
	}, undefined, 2)}\n`;
	if (current === next) {
		existing.push(formatRelative(paths.root, paths.config));
		return;
	}

	await fs.writeFile(paths.config, next, 'utf8');
	updated.push(formatRelative(paths.root, paths.config));
}

async function readConfiguredStoreFolder(configPath: string): Promise<string> {
	try {
		const config = parseStoreConfig(await fs.readFile(configPath, 'utf8'), configPath);
		const folder = config.folder;
		if (folder === undefined) {
			return defaultStoreFolder;
		}

		if (typeof folder !== 'string') {
			throw new Error(`Sundial config folder must be a string: ${configPath}`);
		}

		return normalizeStoreFolder(folder);
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return defaultStoreFolder;
		}

		throw error;
	}
}

function parseStoreConfig(contents: string, configPath: string): Record<string, unknown> {
	const parsed = JSON.parse(contents) as unknown;
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Sundial config must be a JSON object: ${configPath}`);
	}

	return parsed as Record<string, unknown>;
}

function normalizeStoreFolder(folder: string): string {
	const value = folder.trim();
	if (value.length === 0) {
		throw new Error('Sundial folder must not be empty.');
	}

	const portable = value.replace(/\\/g, '/');
	const normalized = path.posix.normalize(portable);
	if (path.isAbsolute(value) || path.posix.isAbsolute(portable) || normalized === '..' || normalized.startsWith('../')) {
		throw new Error('Sundial folder must be a relative path inside the project root.');
	}

	return normalized;
}

function defaultConfig(folder: string): string {
	return `${JSON.stringify({
		version: 1,
		store: storeDirectoryName,
		folder,
	}, undefined, 2)}\n`;
}

function keepFileContents(): string {
	return 'Keep this Sundial store directory present in fresh git worktrees.\n';
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
		sharedSkillTargets ??= selectedHarnessesShareSkillTargets(paths.targetRoot, harnessInstallers);
		return await sharedSkillTargets ? 'generic' : input.preferredTemplateSet;
	}

	return {
		async removeManagedInstructions(target) {
			await removeManagedInstructionBlock(
				path.join(paths.targetRoot, target.relativePath),
				updated,
				paths.root,
				processedInstructionTargets,
			);
		},
		async ensureSkillTemplates(input) {
			const templateSet = await selectedSkillTemplateSet(input);
			for (const asset of skillTemplateAssets(input.root, templateSet)) {
				await ensureFile(path.join(paths.targetRoot, asset.relativePath), await renderTemplate(asset.templatePath), created, existing, paths.root);
			}
		},
		async updateSkillTemplates(input) {
			const templateSet = await selectedSkillTemplateSet(input);
			for (const asset of skillTemplateAssets(input.root, templateSet)) {
				await updateFile(path.join(paths.targetRoot, asset.relativePath), await renderTemplate(asset.templatePath), created, existing, updated, paths.root);
			}
		},
	};
}

async function removeManagedInstructionBlock(
	target: string,
	updated: string[],
	projectRoot: string,
	processedTargets: Set<string>,
): Promise<void> {
	if (!await pathExists(target)) {
		return;
	}

	const identity = await physicalPathIdentity(target);
	if (processedTargets.has(identity)) {
		return;
	}

	const current = await fs.readFile(target, 'utf8');
	const repaired = removeManagedInstructionBlockContents(current);
	if (repaired === current) {
		processedTargets.add(identity);
		return;
	}

	await fs.writeFile(target, repaired, 'utf8');
	processedTargets.add(await physicalPathIdentity(target));
	updated.push(formatRelative(projectRoot, target));
}

function removeManagedInstructionBlockContents(current: string): string {
	const marker = findManagedInstructionMarker(current);
	const start = marker.start;
	if (start === -1) {
		return current;
	}

	const end = current.indexOf(marker.endMarker, start);
	if (end === -1) {
		return current.slice(0, start);
	}

	const endAfterMarker = end + marker.endMarker.length;
	const afterEnd = current.slice(endAfterMarker).startsWith('\n')
		? current.slice(endAfterMarker + 1)
		: current.slice(endAfterMarker);
	return `${current.slice(0, start)}${afterEnd}`;
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
	targetRoot: string,
	harnessInstallers: readonly AgentHarnessInstaller[],
): Promise<boolean> {
	if (harnessInstallers.length < 2) {
		return false;
	}

	for (const skillFile of skillTemplateFiles) {
		const identities = new Map<string, HarnessRoot>();
		for (const installer of harnessInstallers) {
			const skillPath = path.join(targetRoot, installer.root, 'skills', ...skillFile.split('/'));
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

export async function readSundialInstructions(): Promise<string> {
	return (await renderTemplate('instructions/SUNDIAL-INSTRUCTIONS.md')).trim();
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
