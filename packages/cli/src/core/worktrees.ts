import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { findSpec, listSpecs, type SpecRecord } from './specs';
import type { StorePaths } from './store';

const managedWorktreesDirectory = '.sundial-worktrees';
const temporaryCommitMessage = 'Sundial:temp';
const maximumGitOutputBytes = 8 * 1024 * 1024;

export interface GitResult {
	readonly stdout: string;
	readonly stderr: string;
}

export type GitRunner = (cwd: string, args: readonly string[]) => Promise<GitResult>;

export interface ManagedWorktreeServices {
	readonly git: GitRunner;
	readonly pathExists: (targetPath: string) => Promise<boolean>;
}

export interface GitWorktreeEntry {
	readonly worktreePath: string;
	readonly head?: string;
	readonly branch?: string;
	readonly detached: boolean;
	readonly locked: boolean;
	readonly prunable: boolean;
}

export type ManagedSpecWorktreeState =
	| { readonly kind: 'none' }
	| {
		readonly kind: 'associatedElsewhere';
		readonly worktreePath: string;
		readonly primaryPath: string;
		readonly branch: string;
		readonly rebaseInProgress?: boolean;
	}
	| {
		readonly kind: 'associatedActive';
		readonly worktreePath: string;
		readonly primaryPath: string;
		readonly branch: string;
		readonly rebaseInProgress?: boolean;
	}
	| { readonly kind: 'error'; readonly message: string };

export interface ManagedSpecWorktreeSummary {
	readonly id: string;
	readonly state: ManagedSpecWorktreeState;
}

export interface ManagedWorktreeTopology {
	readonly version: 1;
	readonly kind: 'topology';
	readonly primaryPath: string;
	readonly activePath: string;
	readonly activeIsPrimary: boolean;
	readonly specs: readonly ManagedSpecWorktreeSummary[];
}

export interface ManagedWorktreeCreated {
	readonly version: 1;
	readonly kind: 'created';
	readonly specId: string;
	readonly primaryPath: string;
	readonly worktreePath: string;
	readonly branch: string;
}

export type ManagedWorktreeConflict = {
	readonly version: 1;
	readonly kind: 'conflicts';
	readonly specId: string;
	readonly primaryPath: string;
	readonly worktreePath: string;
	readonly primaryBranch: string;
	readonly featureBranch: string;
	readonly conflictPaths: readonly string[];
};

export type ManagedWorktreePreflight =
	| {
		readonly version: 1;
		readonly kind: 'ready';
		readonly specId: string;
		readonly primaryPath: string;
		readonly worktreePath: string;
		readonly primaryBranch: string;
		readonly featureBranch: string;
		readonly primaryHead: string;
		readonly worktreeHead: string;
		readonly needsPrimaryCommitMessage: boolean;
		readonly needsWorktreeCommitMessage: boolean;
		readonly suggestedWorktreeCommitMessage?: string;
	}
	| ManagedWorktreeConflict
	| {
		readonly version: 1;
		readonly kind: 'blocked';
		readonly specId: string;
		readonly message: string;
	};

export interface FinishManagedWorktreeInput {
	readonly expectedPrimaryHead: string;
	readonly expectedWorktreeHead: string;
	readonly primaryCommitMessage?: string;
	readonly worktreeCommitMessage?: string;
}

export type ManagedWorktreeFinishResult =
	| {
		readonly version: 1;
		readonly kind: 'completed';
		readonly specId: string;
		readonly primaryPath: string;
		readonly removedWorktreePath: string;
		readonly branch: string;
		readonly head: string;
	}
	| ManagedWorktreeConflict
	| {
		readonly version: 1;
		readonly kind: 'stale';
		readonly specId: string;
		readonly message: string;
	}
	| {
		readonly version: 1;
		readonly kind: 'blocked';
		readonly specId: string;
		readonly message: string;
	}
	| {
		readonly version: 1;
		readonly kind: 'failed';
		readonly specId: string;
		readonly message: string;
	};

interface RepositoryContext {
	readonly activePath: string;
	readonly primary: GitWorktreeEntry;
	readonly worktrees: readonly GitWorktreeEntry[];
}

interface ResolvedManagedWorktree {
	readonly spec: SpecRecord;
	readonly specName: string;
	readonly context: RepositoryContext;
	readonly state: Extract<ManagedSpecWorktreeState, { readonly kind: 'associatedElsewhere' }>;
}

export const defaultGitRunner: GitRunner = (cwd, args) => new Promise((resolve, reject) => {
	execFile('git', [...args], {
		cwd,
		encoding: 'utf8',
		maxBuffer: maximumGitOutputBytes,
		env: { ...process.env, GIT_EDITOR: 'true' },
	}, (error, stdout, stderr) => {
		if (error !== null) {
			reject(new GitCommandError(args, stringifyOutput(stdout), stringifyOutput(stderr), error));
			return;
		}

		resolve({ stdout: stringifyOutput(stdout), stderr: stringifyOutput(stderr) });
	});
});

const defaultServices: ManagedWorktreeServices = {
	git: defaultGitRunner,
	pathExists: async targetPath => {
		try {
			await fs.access(targetPath);
			return true;
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				return false;
			}
			throw error;
		}
	},
};

export async function listManagedSpecWorktrees(
	paths: StorePaths,
	services: ManagedWorktreeServices = defaultServices,
): Promise<ManagedWorktreeTopology> {
	const context = await repositoryContext(paths.root, services.git);
	const specs = await listSpecs(paths);
	return {
		version: 1,
		kind: 'topology',
		primaryPath: context.primary.worktreePath,
		activePath: context.activePath,
		activeIsPrimary: samePath(context.primary.worktreePath, context.activePath),
		specs: await Promise.all(specs.map(async spec => ({
			id: spec.id,
			state: await classifySpecWorktree(spec, context, services.git).catch(error => ({
				kind: 'error' as const,
				message: errorMessage(error),
			})),
		}))),
	};
}

export async function createManagedSpecWorktree(
	paths: StorePaths,
	specId: string,
	services: ManagedWorktreeServices = defaultServices,
): Promise<ManagedWorktreeCreated> {
	const spec = await requireSpec(paths, specId);
	const context = await repositoryContext(paths.root, services.git);
	const specName = specFileBasename(spec.filePath);
	const state = await classifySpecWorktree(spec, context, services.git);
	if (state.kind !== 'none') {
		throw new Error(state.kind === 'error'
			? state.message
			: `A managed worktree already exists for ${spec.id} at ${state.worktreePath}.`);
	}

	const relativeSpecPath = relativePathInside(paths.root, spec.filePath, 'Spec path');
	const primarySpecOutput = await services.git(context.primary.worktreePath, [
		'ls-tree', '-z', '--name-only', 'HEAD', '--', gitPath(relativeSpecPath),
	]);
	if (!primarySpecOutput.stdout.split('\0').includes(gitPath(relativeSpecPath))) {
		throw new Error(`Commit ${path.basename(spec.filePath)} on the primary branch before creating its worktree.`);
	}

	const worktreePath = path.join(context.primary.worktreePath, managedWorktreesDirectory, specName);
	if (!isInside(worktreePath, path.join(context.primary.worktreePath, managedWorktreesDirectory))) {
		throw new Error(`Managed worktree path escapes ${managedWorktreesDirectory}: ${worktreePath}`);
	}
	if (await services.pathExists(worktreePath)) {
		throw new Error(`Managed worktree path already exists outside Git topology: ${worktreePath}`);
	}

	const commonDir = await gitCommonDirectory(context.primary.worktreePath, services.git);
	await ensureManagedWorktreeExclude(commonDir);
	await fs.mkdir(path.dirname(worktreePath), { recursive: true });

	const branchExists = await localBranchExists(context.primary.worktreePath, specName, services.git);
	await services.git(context.primary.worktreePath, branchExists
		? ['worktree', 'add', worktreePath, specName]
		: ['worktree', 'add', '-b', specName, worktreePath, 'HEAD']);

	return {
		version: 1,
		kind: 'created',
		specId: spec.id,
		primaryPath: context.primary.worktreePath,
		worktreePath,
		branch: specName,
	};
}

export async function preflightManagedSpecWorktree(
	paths: StorePaths,
	specId: string,
	services: ManagedWorktreeServices = defaultServices,
): Promise<ManagedWorktreePreflight> {
	try {
		const resolved = await resolveFinishTarget(paths, specId, services);
		const { context, spec, specName, state } = resolved;
		if (!samePath(context.activePath, context.primary.worktreePath)) {
			return blocked(spec.id, 'Finish Worktree must run from the primary worktree.');
		}

		const primaryBranch = context.primary.branch;
		if (primaryBranch === undefined) {
			return blocked(spec.id, 'The primary worktree must be on a local branch.');
		}

		const managedRebase = await rebaseBranch(state.worktreePath, services.git);
		if (managedRebase !== undefined) {
			if (managedRebase !== specName) {
				return blocked(spec.id, `The feature worktree has an unrelated rebase in progress for ${managedRebase}.`);
			}
			return conflicts(
				spec.id,
				context.primary.worktreePath,
				state.worktreePath,
				primaryBranch,
				specName,
				await unmergedPaths(state.worktreePath, services.git),
			);
		}

		const primaryOperation = await unrelatedGitOperation(context.primary.worktreePath, services.git);
		if (primaryOperation !== undefined) {
			return blocked(spec.id, `The primary worktree has an in-progress ${primaryOperation} operation.`);
		}
		const worktreeOperation = await unrelatedGitOperation(state.worktreePath, services.git);
		if (worktreeOperation !== undefined) {
			return blocked(spec.id, `The feature worktree has an in-progress ${worktreeOperation} operation.`);
		}

		const temporaryFailure = await temporaryCommitFailure(
			[context.primary.worktreePath, state.worktreePath],
			services.git,
		);
		if (temporaryFailure !== undefined) {
			return blocked(spec.id, temporaryFailure);
		}

		const [primaryHead, worktreeHead, primaryDirty, worktreeDirty] = await Promise.all([
			head(context.primary.worktreePath, services.git),
			head(state.worktreePath, services.git),
			isDirty(context.primary.worktreePath, services.git),
			isDirty(state.worktreePath, services.git),
		]);
		const suggestedWorktreeCommitMessage = worktreeDirty
			? await proposedCommitMessage(path.join(
				state.worktreePath,
				relativePathInside(paths.root, spec.filePath, 'Spec path'),
			))
			: undefined;

		return {
			version: 1,
			kind: 'ready',
			specId: spec.id,
			primaryPath: context.primary.worktreePath,
			worktreePath: state.worktreePath,
			primaryBranch,
			featureBranch: specName,
			primaryHead,
			worktreeHead,
			needsPrimaryCommitMessage: primaryDirty,
			needsWorktreeCommitMessage: worktreeDirty,
			...(suggestedWorktreeCommitMessage === undefined ? {} : { suggestedWorktreeCommitMessage }),
		};
	} catch (error) {
		return blocked(specId, errorMessage(error));
	}
}

export async function finishManagedSpecWorktree(
	paths: StorePaths,
	specId: string,
	input: FinishManagedWorktreeInput,
	services: ManagedWorktreeServices = defaultServices,
): Promise<ManagedWorktreeFinishResult> {
	try {
		const context = await repositoryContext(paths.root, services.git);
		const commonDir = await gitCommonDirectory(context.primary.worktreePath, services.git);
		return await withWorktreeLock(commonDir, async () => {
			const preflight = await preflightManagedSpecWorktree(paths, specId, services);
			if (preflight.kind !== 'ready') {
				return preflight;
			}
			if (preflight.primaryHead !== input.expectedPrimaryHead
				|| preflight.worktreeHead !== input.expectedWorktreeHead) {
				return stale(specId, 'The primary or feature branch changed after preflight. Run Finish Worktree again.');
			}

			const primaryMessage = normalizedCommitMessage(input.primaryCommitMessage);
			const worktreeMessage = normalizedCommitMessage(input.worktreeCommitMessage);
			if (preflight.needsPrimaryCommitMessage && primaryMessage === undefined) {
				return blocked(specId, 'A commit message is required for primary-worktree changes.');
			}
			if (preflight.needsWorktreeCommitMessage && worktreeMessage === undefined) {
				return blocked(specId, 'A commit message is required for feature-worktree changes.');
			}

			if (preflight.needsPrimaryCommitMessage) {
				await commitAll(preflight.primaryPath, primaryMessage as string, services.git);
			}
			if (preflight.needsWorktreeCommitMessage) {
				await commitAll(preflight.worktreePath, worktreeMessage as string, services.git);
			}

			const primaryHead = await head(preflight.primaryPath, services.git);
			try {
				await services.git(preflight.worktreePath, ['rebase', primaryHead]);
			} catch (error) {
				const rebase = await rebaseBranch(preflight.worktreePath, services.git);
				if (rebase === preflight.featureBranch) {
					return conflicts(
						specId,
						preflight.primaryPath,
						preflight.worktreePath,
						preflight.primaryBranch,
						preflight.featureBranch,
						await unmergedPaths(preflight.worktreePath, services.git),
					);
				}
				return failed(specId, `Git failed to rebase ${preflight.featureBranch}: ${errorMessage(error)}`);
			}

			if (await head(preflight.primaryPath, services.git) !== primaryHead) {
				return stale(specId, 'The primary branch changed during rebase. Run Finish Worktree again.');
			}

			await services.git(preflight.primaryPath, ['merge', '--ff-only', preflight.featureBranch]);
			await services.git(preflight.primaryPath, [
				'merge-base', '--is-ancestor', preflight.featureBranch, preflight.primaryBranch,
			]);
			const mergedHead = await head(preflight.primaryPath, services.git);
			await services.git(preflight.primaryPath, ['worktree', 'remove', preflight.worktreePath]);
			return {
				version: 1,
				kind: 'completed',
				specId,
				primaryPath: preflight.primaryPath,
				removedWorktreePath: preflight.worktreePath,
				branch: preflight.featureBranch,
				head: mergedHead,
			};
		});
	} catch (error) {
		return failed(specId, errorMessage(error));
	}
}

export function parseGitWorktreePorcelain(output: string): readonly GitWorktreeEntry[] {
	const entries: GitWorktreeEntry[] = [];
	let current: {
		worktreePath: string;
		head?: string;
		branch?: string;
		detached: boolean;
		locked: boolean;
		prunable: boolean;
	} | undefined;

	const push = (): void => {
		if (current !== undefined) {
			entries.push(current);
			current = undefined;
		}
	};

	for (const line of output.split(/\r?\n/)) {
		if (line === '') {
			push();
			continue;
		}
		if (line.startsWith('worktree ')) {
			push();
			current = {
				worktreePath: line.slice('worktree '.length),
				detached: false,
				locked: false,
				prunable: false,
			};
			continue;
		}
		if (current === undefined) {
			continue;
		}
		if (line.startsWith('HEAD ')) {
			current.head = line.slice('HEAD '.length);
		} else if (line.startsWith('branch ')) {
			current.branch = normalizeBranch(line.slice('branch '.length));
		} else if (line === 'detached') {
			current.detached = true;
		} else if (line === 'locked' || line.startsWith('locked ')) {
			current.locked = true;
		} else if (line === 'prunable' || line.startsWith('prunable ')) {
			current.prunable = true;
		}
	}
	push();
	return entries;
}

export async function ensureManagedWorktreeExclude(commonDir: string): Promise<void> {
	const infoDirectory = path.join(commonDir, 'info');
	const excludePath = path.join(infoDirectory, 'exclude');
	await fs.mkdir(infoDirectory, { recursive: true });
	let contents = '';
	try {
		contents = await fs.readFile(excludePath, 'utf8');
	} catch (error) {
		if (!isNodeError(error) || error.code !== 'ENOENT') {
			throw error;
		}
	}
	if (contents.split(/\r?\n/).some(line => line.trim() === `${managedWorktreesDirectory}/`)) {
		return;
	}
	const separator = contents.length === 0 || contents.endsWith('\n') ? '' : '\n';
	await fs.writeFile(excludePath, `${contents}${separator}${managedWorktreesDirectory}/\n`, 'utf8');
}

export function readProposedCommitMessage(markdown: string): string | undefined {
	const lines = markdown.split(/\r?\n/);
	const headingIndex = lines.findIndex(line => /^##\s+Proposed Commit Message\s*$/i.test(line.trim()));
	if (headingIndex < 0) {
		return undefined;
	}
	const body: string[] = [];
	for (const line of lines.slice(headingIndex + 1)) {
		if (/^#{1,6}\s+/.test(line)) {
			break;
		}
		body.push(line);
	}
	const message = body.join('\n').trim();
	return message === '' ? undefined : message;
}

function conflicts(
	specId: string,
	primaryPath: string,
	worktreePath: string,
	primaryBranch: string,
	featureBranch: string,
	conflictPaths: readonly string[],
): ManagedWorktreeConflict {
	return {
		version: 1,
		kind: 'conflicts',
		specId,
		primaryPath,
		worktreePath,
		primaryBranch,
		featureBranch,
		conflictPaths: [...conflictPaths].sort(),
	};
}

function blocked(specId: string, message: string): Extract<ManagedWorktreePreflight, { kind: 'blocked' }> {
	return { version: 1, kind: 'blocked', specId, message };
}

function stale(specId: string, message: string): Extract<ManagedWorktreeFinishResult, { kind: 'stale' }> {
	return { version: 1, kind: 'stale', specId, message };
}

function failed(specId: string, message: string): Extract<ManagedWorktreeFinishResult, { kind: 'failed' }> {
	return { version: 1, kind: 'failed', specId, message };
}

async function repositoryContext(cwd: string, git: GitRunner): Promise<RepositoryContext> {
	const [activeResult, worktreeResult] = await Promise.all([
		git(cwd, ['rev-parse', '--show-toplevel']),
		git(cwd, ['worktree', 'list', '--porcelain']),
	]);
	const activePath = firstLine(activeResult.stdout);
	const worktrees = parseGitWorktreePorcelain(worktreeResult.stdout);
	const primary = worktrees[0];
	if (activePath === '' || primary === undefined) {
		throw new Error(`No Git worktree topology found for ${cwd}.`);
	}
	return {
		activePath: path.resolve(activePath),
		primary: { ...primary, worktreePath: path.resolve(primary.worktreePath) },
		worktrees: worktrees.map(entry => ({ ...entry, worktreePath: path.resolve(entry.worktreePath) })),
	};
}

async function classifySpecWorktree(
	spec: SpecRecord,
	context: RepositoryContext,
	git: GitRunner,
): Promise<ManagedSpecWorktreeState> {
	const specName = specFileBasename(spec.filePath);
	const matches = context.worktrees.filter(entry => path.basename(entry.worktreePath) === specName);
	if (matches.length > 1) {
		return { kind: 'error', message: `Multiple worktrees match ${specName}.` };
	}
	const branchElsewhere = context.worktrees.find(entry => entry.branch === specName && !matches.includes(entry));
	if (branchElsewhere !== undefined) {
		return {
			kind: 'error',
			message: `Branch ${specName} is checked out at a differently named path: ${branchElsewhere.worktreePath}`,
		};
	}
	const match = matches[0];
	if (match === undefined) {
		return { kind: 'none' };
	}
	const expectedPath = path.join(context.primary.worktreePath, managedWorktreesDirectory, specName);
	if (!samePath(match.worktreePath, expectedPath)) {
		return {
			kind: 'error',
			message: `Worktree ${match.worktreePath} matches ${specName} but is outside the managed worktree directory.`,
		};
	}
	if (match.locked || match.prunable) {
		return {
			kind: 'error',
			message: `Managed worktree is ${match.locked ? 'locked' : 'prunable'}: ${match.worktreePath}`,
		};
	}
	let branch = match.branch;
	let rebaseInProgress = false;
	if (branch === undefined && match.detached) {
		branch = await rebaseBranch(match.worktreePath, git);
		rebaseInProgress = branch !== undefined;
	}
	if (branch !== specName) {
		return {
			kind: 'error',
			message: `Managed path ${match.worktreePath} is not on branch ${specName}.`,
		};
	}
	const details = {
		worktreePath: match.worktreePath,
		primaryPath: context.primary.worktreePath,
		branch,
		...(rebaseInProgress ? { rebaseInProgress: true } : {}),
	};
	return samePath(match.worktreePath, context.activePath)
		? { kind: 'associatedActive', ...details }
		: { kind: 'associatedElsewhere', ...details };
}

async function resolveFinishTarget(
	paths: StorePaths,
	specId: string,
	services: ManagedWorktreeServices,
): Promise<ResolvedManagedWorktree> {
	const spec = await requireSpec(paths, specId);
	const context = await repositoryContext(paths.root, services.git);
	const state = await classifySpecWorktree(spec, context, services.git);
	if (state.kind === 'error') {
		throw new Error(state.message);
	}
	if (state.kind !== 'associatedElsewhere') {
		throw new Error(state.kind === 'associatedActive'
			? 'Finish Worktree must run from the primary worktree.'
			: `No managed worktree exists for ${spec.id}.`);
	}
	const relativeSpecPath = relativePathInside(paths.root, spec.filePath, 'Spec path');
	const trackedSpec = await services.git(context.primary.worktreePath, [
		'ls-tree', '-z', '--name-only', 'HEAD', '--', gitPath(relativeSpecPath),
	]);
	if (!trackedSpec.stdout.split('\0').includes(gitPath(relativeSpecPath))) {
		throw new Error(`Commit ${path.basename(spec.filePath)} on the primary branch before finishing its worktree.`);
	}
	return { spec, specName: specFileBasename(spec.filePath), context, state };
}

async function requireSpec(paths: StorePaths, specId: string): Promise<SpecRecord> {
	const spec = await findSpec(paths, specId);
	if (spec === undefined) {
		throw new Error(`No spec found with id "${specId}".`);
	}
	return spec;
}

async function proposedCommitMessage(specPath: string): Promise<string | undefined> {
	try {
		return readProposedCommitMessage(await fs.readFile(specPath, 'utf8'));
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
}

async function commitAll(cwd: string, message: string, git: GitRunner): Promise<void> {
	await git(cwd, ['add', '-A']);
	await git(cwd, ['commit', '-m', message]);
}

async function isDirty(cwd: string, git: GitRunner): Promise<boolean> {
	return (await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout !== '';
}

async function unmergedPaths(cwd: string, git: GitRunner): Promise<readonly string[]> {
	const output = (await git(cwd, ['diff', '--name-only', '--diff-filter=U', '-z'])).stdout;
	return output.split('\0').filter(Boolean);
}

async function unrelatedGitOperation(cwd: string, git: GitRunner): Promise<string | undefined> {
	for (const marker of ['rebase-merge', 'rebase-apply']) {
		if (await gitPathExists(cwd, marker, git)) {
			return 'rebase';
		}
	}
	for (const [marker, label] of [
		['MERGE_HEAD', 'merge'],
		['CHERRY_PICK_HEAD', 'cherry-pick'],
		['REVERT_HEAD', 'revert'],
	] as const) {
		if (await gitPathExists(cwd, marker, git)) {
			return label;
		}
	}
	return undefined;
}

async function rebaseBranch(cwd: string, git: GitRunner): Promise<string | undefined> {
	for (const directory of ['rebase-merge', 'rebase-apply']) {
		const gitPath = await resolvedGitPath(cwd, directory, git);
		try {
			const headName = (await fs.readFile(path.join(gitPath, 'head-name'), 'utf8')).trim();
			return normalizeBranch(headName);
		} catch (error) {
			if (!isNodeError(error) || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
				throw error;
			}
		}
	}
	return undefined;
}

async function gitPathExists(cwd: string, marker: string, git: GitRunner): Promise<boolean> {
	try {
		await fs.access(await resolvedGitPath(cwd, marker, git));
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

async function resolvedGitPath(cwd: string, marker: string, git: GitRunner): Promise<string> {
	const value = firstLine((await git(cwd, ['rev-parse', '--git-path', marker])).stdout);
	return path.resolve(cwd, value);
}

async function temporaryCommitFailure(cwds: readonly string[], git: GitRunner): Promise<string | undefined> {
	for (const cwd of cwds) {
		const commits = await leadingTemporaryCommits(cwd, git);
		for (const commit of commits) {
			const remoteRefs = (await git(cwd, [
				'for-each-ref', '--format=%(refname)', '--contains', commit, 'refs/remotes',
			])).stdout.trim();
			if (remoteRefs !== '') {
				return `Published Sundial temporary commit ${commit.slice(0, 12)} must be repaired manually.`;
			}
		}
		if (commits.length > 0) {
			return `Consolidate the Sundial temporary commit stack in ${cwd} before finishing the worktree.`;
		}
	}
	return undefined;
}

async function leadingTemporaryCommits(cwd: string, git: GitRunner): Promise<readonly string[]> {
	const output = (await git(cwd, ['log', '-n', '100', '--format=%H%x00%B%x00%x1e', 'HEAD'])).stdout;
	const commits: string[] = [];
	for (const record of output.split('\x1e')) {
		const [hash, message] = record.trimStart().split('\0');
		if (hash === undefined || message === undefined || message.trimEnd() !== temporaryCommitMessage) {
			break;
		}
		commits.push(hash.trim());
	}
	return commits;
}

async function localBranchExists(cwd: string, branch: string, git: GitRunner): Promise<boolean> {
	try {
		await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
		return true;
	} catch {
		return false;
	}
}

async function head(cwd: string, git: GitRunner): Promise<string> {
	return firstLine((await git(cwd, ['rev-parse', 'HEAD'])).stdout);
}

async function gitCommonDirectory(cwd: string, git: GitRunner): Promise<string> {
	const value = firstLine((await git(cwd, ['rev-parse', '--git-common-dir'])).stdout);
	if (value === '') {
		throw new Error(`Git returned no common directory for ${cwd}.`);
	}
	return path.resolve(cwd, value);
}

async function withWorktreeLock<T>(commonDir: string, action: () => Promise<T>): Promise<T> {
	const lockPath = path.join(commonDir, 'sundial-worktree.lock');
	let handle: fs.FileHandle;
	try {
		handle = await fs.open(lockPath, 'wx');
	} catch (error) {
		if (isNodeError(error) && error.code === 'EEXIST') {
			throw new Error('Another Sundial worktree operation is already running.');
		}
		throw error;
	}
	try {
		await handle.writeFile(`${process.pid}\n`, 'utf8');
		return await action();
	} finally {
		await handle.close();
		await fs.unlink(lockPath).catch(error => {
			if (!isNodeError(error) || error.code !== 'ENOENT') {
				throw error;
			}
		});
	}
}

function specFileBasename(specPath: string): string {
	const basename = path.basename(specPath);
	return basename.toLowerCase().endsWith('.md') ? basename.slice(0, -3) : basename;
}

function relativePathInside(root: string, target: string, label: string): string {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`${label} must be inside ${root}.`);
	}
	return relative;
}

function isInside(target: string, parent: string): boolean {
	const relative = path.relative(path.resolve(parent), path.resolve(target));
	return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
	return path.resolve(left) === path.resolve(right);
}

function gitPath(value: string): string {
	return value.split(path.sep).join('/');
}

function normalizeBranch(value: string): string {
	const prefix = 'refs/heads/';
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function normalizedCommitMessage(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized === undefined || normalized === '' ? undefined : normalized;
}

function firstLine(value: string): string {
	return value.split(/\r?\n/, 1)[0].trim();
}

function errorMessage(error: unknown): string {
	if (error instanceof GitCommandError) {
		return error.stderr.trim() || error.stdout.trim() || error.message;
	}
	return error instanceof Error ? error.message : String(error);
}

function stringifyOutput(value: string | Buffer | undefined): string {
	if (value === undefined) {
		return '';
	}
	return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}

class GitCommandError extends Error {
	constructor(
		readonly args: readonly string[],
		readonly stdout: string,
		readonly stderr: string,
		cause: Error,
	) {
		super(`git ${args[0] ?? ''} failed: ${cause.message}`);
		this.name = 'GitCommandError';
	}
}
