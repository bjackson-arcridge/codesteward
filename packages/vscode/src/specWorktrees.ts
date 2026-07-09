import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface GitCommandResult {
	readonly stdout: string;
	readonly stderr: string;
}

export type GitRunner = (cwd: string, args: readonly string[]) => Promise<GitCommandResult>;
export type BranchPrompt = (defaultBranch: string) => Promise<string | undefined>;
export type ExistingWorktreePrompt = (worktreePath: string, branch: string) => Promise<boolean>;
export type OpenFolderRunner = (worktreePath: string) => Promise<void>;
export type ProgressRunner = <T>(title: string, task: () => Promise<T>) => Promise<T>;
export type PathExists = (targetPath: string) => Promise<boolean>;

export interface SpawnSpecWorktreeOptions {
	readonly workspaceRoot: string;
	readonly specPath: string;
	readonly promptBranchName: BranchPrompt;
	readonly confirmOpenExistingWorktree: ExistingWorktreePrompt;
	readonly openFolder: OpenFolderRunner;
	readonly git?: GitRunner;
	readonly pathExists?: PathExists;
	readonly withProgress?: ProgressRunner;
}

export type SpawnSpecWorktreeResult =
	| {
		readonly kind: 'created';
		readonly branch: string;
		readonly worktreePath: string;
	}
	| {
		readonly kind: 'openedExisting';
		readonly branch: string;
		readonly worktreePath: string;
	}
	| {
		readonly kind: 'cancelled';
		readonly reason: 'branchPrompt' | 'existingWorktreeDeclined';
	}
	| {
		readonly kind: 'failed';
		readonly message: string;
	};

export interface GitWorktreeEntry {
	readonly worktreePath: string;
	readonly branch?: string;
}

export interface GitWorktreeContext {
	readonly linked: boolean;
	readonly specPrefix?: string;
}

export const defaultGitRunner: GitRunner = (cwd, args) => {
	return new Promise((resolve, reject) => {
		execFile('git', [...args], { cwd }, (error, stdout, stderr) => {
			if (error !== null) {
				reject(error);
				return;
			}

			resolve({
				stdout: stringifyOutput(stdout),
				stderr: stringifyOutput(stderr),
			});
		});
	});
};

export async function gitWorktreeContext(
	workspaceRoot: string,
	git: GitRunner = defaultGitRunner,
): Promise<GitWorktreeContext> {
	try {
		const [gitDirResult, commonDirResult, topLevelResult] = await Promise.all([
			git(workspaceRoot, ['rev-parse', '--git-dir']),
			git(workspaceRoot, ['rev-parse', '--git-common-dir']),
			git(workspaceRoot, ['rev-parse', '--show-toplevel']),
		]);
		const gitDir = resolveGitPath(workspaceRoot, firstLine(gitDirResult.stdout));
		const commonDir = resolveGitPath(workspaceRoot, firstLine(commonDirResult.stdout));
		const linked = gitDir.length > 0 && commonDir.length > 0 && gitDir !== commonDir;
		if (!linked) {
			return { linked: false };
		}

		return {
			linked,
			...optionalSpecPrefix(firstLine(topLevelResult.stdout)),
		};
	} catch {
		return { linked: false };
	}
}

export async function isLinkedGitWorktree(
	workspaceRoot: string,
	git: GitRunner = defaultGitRunner,
): Promise<boolean> {
	return (await gitWorktreeContext(workspaceRoot, git)).linked;
}

export async function spawnSpecWorktree(options: SpawnSpecWorktreeOptions): Promise<SpawnSpecWorktreeResult> {
	const git = options.git ?? defaultGitRunner;
	const pathExists = options.pathExists ?? defaultPathExists;
	const withProgress = options.withProgress ?? runWithoutProgress;
	const specName = specFileBasename(options.specPath);

	if (await isLinkedGitWorktree(options.workspaceRoot, git)) {
		return failed('Cannot spawn a worktree from a workspace that is already a Git worktree.');
	}

	let gitRoot: string;
	try {
		gitRoot = firstLine((await git(options.workspaceRoot, ['rev-parse', '--show-toplevel'])).stdout);
	} catch {
		return failed(`No Git repository found for ${options.workspaceRoot}.`);
	}

	if (gitRoot.length === 0) {
		return failed(`No Git repository found for ${options.workspaceRoot}.`);
	}

	const branchInput = await options.promptBranchName(defaultBranchName(specName));
	if (branchInput === undefined) {
		return { kind: 'cancelled', reason: 'branchPrompt' };
	}

	const branch = branchInput.trim();
	if (branch.length === 0) {
		return failed('Branch name is required.');
	}

	try {
		await git(gitRoot, ['check-ref-format', '--branch', branch]);
	} catch {
		return failed(`Invalid branch name "${branch}".`);
	}

	let worktrees: readonly GitWorktreeEntry[];
	try {
		worktrees = parseWorktreeListPorcelain((await git(gitRoot, ['worktree', 'list', '--porcelain'])).stdout);
	} catch (error) {
		return failed(`Could not inspect Git worktrees: ${errorDetails(error)}`);
	}

	const existing = findWorktreeForBranch(worktrees, branch);
	if (existing !== undefined) {
		try {
			if (await options.confirmOpenExistingWorktree(existing.worktreePath, branch)) {
				await options.openFolder(existing.worktreePath);
				return { kind: 'openedExisting', branch, worktreePath: existing.worktreePath };
			}
		} catch (error) {
			return failed(`Could not open existing worktree: ${errorDetails(error)}`);
		}

		return { kind: 'cancelled', reason: 'existingWorktreeDeclined' };
	}

	const worktreePath = defaultWorktreePath(gitRoot, specName);
	const pathError = validateWorktreePath(worktreePath, gitRoot, options.workspaceRoot);
	if (pathError !== undefined) {
		return failed(pathError);
	}

	if (await pathExists(worktreePath)) {
		return failed(`Worktree path already exists: ${worktreePath}`);
	}

	const branchExists = await localBranchExists(git, gitRoot, branch);
	const addArgs = branchExists
		? ['worktree', 'add', worktreePath, branch]
		: ['worktree', 'add', '-b', branch, worktreePath, 'HEAD'];

	try {
		await withProgress(`Creating worktree ${branch}`, () => git(gitRoot, addArgs));
	} catch (error) {
		return failed(`Git failed to create worktree: ${errorDetails(error)}`);
	}

	try {
		await options.openFolder(worktreePath);
	} catch (error) {
		return failed(`Created worktree at ${worktreePath}, but VS Code could not open it: ${errorDetails(error)}`);
	}

	return { kind: 'created', branch, worktreePath };
}

export function specFileBasename(specPath: string): string {
	const basename = path.basename(specPath);
	return basename.toLowerCase().endsWith('.md') ? basename.slice(0, -3) : basename;
}

export function defaultBranchName(specName: string): string {
	return specName;
}

export function defaultWorktreePath(gitRoot: string, specName: string): string {
	return path.join(path.dirname(gitRoot), specName);
}

export function specPrefixFromWorktreePath(worktreePath: string): string | undefined {
	const match = /^(SPEC-\d{4})(?:\b|[-_])/i.exec(path.basename(worktreePath));
	return match?.[1].toUpperCase();
}

export function parseWorktreeListPorcelain(output: string): readonly GitWorktreeEntry[] {
	const entries: GitWorktreeEntry[] = [];
	let current: { worktreePath: string; branch?: string } | undefined;

	const pushCurrent = (): void => {
		if (current !== undefined) {
			entries.push(current);
			current = undefined;
		}
	};

	for (const line of output.split(/\r?\n/)) {
		if (line.length === 0) {
			pushCurrent();
			continue;
		}

		if (line.startsWith('worktree ')) {
			pushCurrent();
			current = { worktreePath: line.slice('worktree '.length) };
			continue;
		}

		if (line.startsWith('branch ') && current !== undefined) {
			current.branch = normalizeLocalBranchRef(line.slice('branch '.length));
		}
	}

	pushCurrent();
	return entries;
}

export function findWorktreeForBranch(
	worktrees: readonly GitWorktreeEntry[],
	branch: string,
): GitWorktreeEntry | undefined {
	return worktrees.find(worktree => worktree.branch === branch);
}

export function validateWorktreePath(
	worktreePath: string,
	gitRoot: string,
	workspaceRoot: string,
): string | undefined {
	const resolvedWorktreePath = path.resolve(worktreePath);
	const gitDir = path.join(path.resolve(gitRoot), '.git');
	if (isSameOrInside(resolvedWorktreePath, gitDir)) {
		return `Refusing to create a worktree inside .git: ${worktreePath}`;
	}

	const sundialDir = path.join(path.resolve(workspaceRoot), 'sundial');
	if (isSameOrInside(resolvedWorktreePath, sundialDir)) {
		return `Refusing to create a worktree inside sundial/: ${worktreePath}`;
	}

	return undefined;
}

async function localBranchExists(git: GitRunner, gitRoot: string, branch: string): Promise<boolean> {
	try {
		await git(gitRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
		return true;
	} catch {
		return false;
	}
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
}

const runWithoutProgress: ProgressRunner = async (_title, task) => task();

function failed(message: string): SpawnSpecWorktreeResult {
	return { kind: 'failed', message };
}

function firstLine(output: string): string {
	return output.split(/\r?\n/, 1)[0].trim();
}

function normalizeLocalBranchRef(ref: string): string {
	const prefix = 'refs/heads/';
	return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

function optionalSpecPrefix(worktreePath: string): Pick<GitWorktreeContext, 'specPrefix'> {
	const specPrefix = specPrefixFromWorktreePath(worktreePath);
	return specPrefix === undefined ? {} : { specPrefix };
}

function resolveGitPath(cwd: string, gitPath: string): string {
	if (gitPath.length === 0) {
		return '';
	}

	return path.resolve(cwd, gitPath);
}

function isSameOrInside(targetPath: string, parentPath: string): boolean {
	const relative = path.relative(parentPath, targetPath);
	return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function errorDetails(error: unknown): string {
	if (error instanceof Error) {
		const output = [
			stringifyErrorOutput(error, 'stderr'),
			stringifyErrorOutput(error, 'stdout'),
			error.message,
		].filter(value => value.length > 0);
		return output.join('\n');
	}

	return String(error);
}

function stringifyErrorOutput(error: Error, key: 'stdout' | 'stderr'): string {
	const value = (error as Error & Partial<Record<'stdout' | 'stderr', string | Buffer>>)[key];
	return stringifyOutput(value).trim();
}

function stringifyOutput(output: string | Buffer | undefined): string {
	if (output === undefined) {
		return '';
	}

	return Buffer.isBuffer(output) ? output.toString('utf8') : output;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}
