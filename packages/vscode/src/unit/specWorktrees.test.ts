import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import {
	defaultBranchName,
	defaultWorktreePath,
	findWorktreeForBranch,
	gitWorktreeContext,
	parseWorktreeListPorcelain,
	spawnSpecWorktree,
	specFileBasename,
	specPrefixFromWorktreePath,
	validateWorktreePath,
	type GitRunner,
} from '../specWorktrees';

interface GitCall {
	readonly cwd: string;
	readonly args: readonly string[];
}

interface GitHarnessOptions {
	readonly repoRoot: string;
	readonly revParseFails?: boolean;
	readonly invalidBranch?: boolean;
	readonly worktreeList?: string;
	readonly branchExists?: boolean;
	readonly addFails?: boolean;
	readonly linkedWorktree?: boolean;
}

describe('spec worktree helpers', () => {
	test('derives spec names, branch names, and sibling worktree paths', () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const specName = specFileBasename(path.join(repoRoot, 'sundial', 'specs', 'SPEC-0007-spawn-a-worktree-button.md'));

		assert.equal(specName, 'SPEC-0007-spawn-a-worktree-button');
		assert.equal(defaultBranchName(specName), 'SPEC-0007-spawn-a-worktree-button');
		assert.equal(
			defaultWorktreePath(repoRoot, specName),
			path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button'),
		);
	});

	test('parses git worktree porcelain output and finds a local branch checkout', () => {
		const entries = parseWorktreeListPorcelain([
			'worktree /workspace/repo',
			'HEAD 1111111',
			'branch refs/heads/main',
			'',
			'worktree /workspace/detached',
			'HEAD 2222222',
			'detached',
			'',
			'worktree /workspace/SPEC-0007-spawn-a-worktree-button',
			'HEAD 3333333',
			'branch refs/heads/SPEC-0007-spawn-a-worktree-button',
			'',
		].join('\n'));

		assert.deepEqual(entries, [
			{ worktreePath: '/workspace/repo', branch: 'main' },
			{ worktreePath: '/workspace/detached' },
			{
				worktreePath: '/workspace/SPEC-0007-spawn-a-worktree-button',
				branch: 'SPEC-0007-spawn-a-worktree-button',
			},
		]);
		assert.equal(
			findWorktreeForBranch(entries, 'SPEC-0007-spawn-a-worktree-button')?.worktreePath,
			'/workspace/SPEC-0007-spawn-a-worktree-button',
		);
	});

	test('rejects worktree paths inside .git or sundial store directories', () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');

		assert.match(
			validateWorktreePath(path.join(repoRoot, '.git', 'SPEC-0007'), repoRoot, repoRoot) ?? '',
			/inside \.git/,
		);
		assert.match(
			validateWorktreePath(path.join(repoRoot, 'sundial', 'SPEC-0007'), repoRoot, repoRoot) ?? '',
			/inside sundial\//,
		);
		assert.equal(
			validateWorktreePath(path.join(path.dirname(repoRoot), 'SPEC-0007'), repoRoot, repoRoot),
			undefined,
		);
	});

	test('extracts SPEC prefixes from worktree root names', () => {
		assert.equal(
			specPrefixFromWorktreePath(path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button')),
			'SPEC-0007',
		);
		assert.equal(
			specPrefixFromWorktreePath(path.join(path.sep, 'workspace', 'spec-0008-other-worktree')),
			'SPEC-0008',
		);
		assert.equal(specPrefixFromWorktreePath(path.join(path.sep, 'workspace', 'feature-worktree')), undefined);
	});

	test('detects linked worktree context and matching SPEC prefix', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button');
		const { git } = gitHarness({ repoRoot, linkedWorktree: true });

		assert.deepEqual(await gitWorktreeContext(repoRoot, git), {
			linked: true,
			specPrefix: 'SPEC-0007',
		});
	});
});

describe('spawnSpecWorktree', () => {
	test('cancels when branch input is dismissed', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const { git, calls } = gitHarness({ repoRoot });
		let defaultBranch = '';

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			promptBranchName: async value => {
				defaultBranch = value;
				return undefined;
			},
			confirmOpenExistingWorktree: async () => true,
			openFolder: async () => {},
		});

		assert.deepEqual(result, { kind: 'cancelled', reason: 'branchPrompt' });
		assert.equal(defaultBranch, 'SPEC-0007-spawn-a-worktree-button');
		assert.equal(calls.some(call => call.args[0] === 'check-ref-format'), false);
	});

	test('fails before prompting from an existing linked worktree', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button');
		const { git, calls } = gitHarness({ repoRoot, linkedWorktree: true });
		let prompted = false;

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			promptBranchName: async () => {
				prompted = true;
				return 'branch';
			},
			confirmOpenExistingWorktree: async () => true,
			openFolder: async () => {},
		});

		assert.equal(result.kind, 'failed');
		assert.match(result.kind === 'failed' ? result.message : '', /already a Git worktree/);
		assert.equal(prompted, false);
		assert.equal(calls.some(call => call.args[0] === 'check-ref-format'), false);
	});

	test('fails before prompting when the workspace is not in a git repository', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const { git } = gitHarness({ repoRoot, revParseFails: true });
		let prompted = false;

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			promptBranchName: async () => {
				prompted = true;
				return 'branch';
			},
			confirmOpenExistingWorktree: async () => true,
			openFolder: async () => {},
		});

		assert.equal(result.kind, 'failed');
		assert.match(result.kind === 'failed' ? result.message : '', /No Git repository/);
		assert.equal(prompted, false);
	});

	test('fails when git rejects the branch name', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const { git, calls } = gitHarness({ repoRoot, invalidBranch: true });

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			promptBranchName: async () => 'bad branch',
			confirmOpenExistingWorktree: async () => true,
			openFolder: async () => {},
		});

		assert.equal(result.kind, 'failed');
		assert.match(result.kind === 'failed' ? result.message : '', /Invalid branch name/);
		assert.equal(calls.some(call => call.args[0] === 'worktree' && call.args[1] === 'add'), false);
	});

	test('creates a new branch worktree from HEAD and opens it', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const expectedWorktreePath = path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button');
		const { git, calls } = gitHarness({ repoRoot });
		const opened: string[] = [];
		const progressTitles: string[] = [];

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			pathExists: async () => false,
			promptBranchName: async value => value,
			confirmOpenExistingWorktree: async () => true,
			openFolder: async worktreePath => {
				opened.push(worktreePath);
			},
			withProgress: async (title, task) => {
				progressTitles.push(title);
				return task();
			},
		});

		assert.deepEqual(result, {
			kind: 'created',
			branch: 'SPEC-0007-spawn-a-worktree-button',
			worktreePath: expectedWorktreePath,
		});
		assert.deepEqual(opened, [expectedWorktreePath]);
		assert.deepEqual(progressTitles, ['Creating worktree SPEC-0007-spawn-a-worktree-button']);
		assert.deepEqual(findCall(calls, 'worktree', 'add')?.args, [
			'worktree',
			'add',
			'-b',
			'SPEC-0007-spawn-a-worktree-button',
			expectedWorktreePath,
			'HEAD',
		]);
	});

	test('adds an existing local branch without recreating it', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const expectedWorktreePath = path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button');
		const { git, calls } = gitHarness({ repoRoot, branchExists: true });

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			pathExists: async () => false,
			promptBranchName: async value => value,
			confirmOpenExistingWorktree: async () => true,
			openFolder: async () => {},
		});

		assert.equal(result.kind, 'created');
		assert.deepEqual(findCall(calls, 'worktree', 'add')?.args, [
			'worktree',
			'add',
			expectedWorktreePath,
			'SPEC-0007-spawn-a-worktree-button',
		]);
	});

	test('opens an already attached branch when the user accepts', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const existingWorktreePath = path.join(path.sep, 'workspace', 'SPEC-0007-spawn-a-worktree-button');
		const { git, calls } = gitHarness({
			repoRoot,
			worktreeList: [
				`worktree ${existingWorktreePath}`,
				'HEAD 1111111',
				'branch refs/heads/SPEC-0007-spawn-a-worktree-button',
				'',
			].join('\n'),
		});
		const opened: string[] = [];

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			promptBranchName: async value => value,
			confirmOpenExistingWorktree: async () => true,
			openFolder: async worktreePath => {
				opened.push(worktreePath);
			},
		});

		assert.deepEqual(result, {
			kind: 'openedExisting',
			branch: 'SPEC-0007-spawn-a-worktree-button',
			worktreePath: existingWorktreePath,
		});
		assert.deepEqual(opened, [existingWorktreePath]);
		assert.equal(calls.some(call => call.args[0] === 'show-ref'), false);
		assert.equal(calls.some(call => call.args[0] === 'worktree' && call.args[1] === 'add'), false);
	});

	test('fails before git worktree add when the default path already exists', async () => {
		const repoRoot = path.join(path.sep, 'workspace', 'repo');
		const { git, calls } = gitHarness({ repoRoot });

		const result = await spawnSpecWorktree({
			workspaceRoot: repoRoot,
			specPath: specPath(repoRoot),
			git,
			pathExists: async () => true,
			promptBranchName: async value => value,
			confirmOpenExistingWorktree: async () => true,
			openFolder: async () => {},
		});

		assert.equal(result.kind, 'failed');
		assert.match(result.kind === 'failed' ? result.message : '', /already exists/);
		assert.equal(calls.some(call => call.args[0] === 'worktree' && call.args[1] === 'add'), false);
	});
});

function specPath(repoRoot: string): string {
	return path.join(repoRoot, 'sundial', 'specs', 'SPEC-0007-spawn-a-worktree-button.md');
}

function gitHarness(options: GitHarnessOptions): { readonly git: GitRunner; readonly calls: readonly GitCall[] } {
	const calls: GitCall[] = [];
	const git: GitRunner = async (cwd, args) => {
		calls.push({ cwd, args: [...args] });

		if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
			if (options.revParseFails === true) {
				throw gitError('fatal: not a git repository');
			}

			return { stdout: `${options.repoRoot}\n`, stderr: '' };
		}

		if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
			const gitDir = options.linkedWorktree === true
				? path.join(path.sep, 'workspace', 'repo', '.git', 'worktrees', path.basename(options.repoRoot))
				: path.join(options.repoRoot, '.git');
			return { stdout: `${gitDir}\n`, stderr: '' };
		}

		if (args[0] === 'rev-parse' && args[1] === '--git-common-dir') {
			const commonDir = options.linkedWorktree === true
				? path.join(path.sep, 'workspace', 'repo', '.git')
				: path.join(options.repoRoot, '.git');
			return { stdout: `${commonDir}\n`, stderr: '' };
		}

		if (args[0] === 'check-ref-format' && args[1] === '--branch') {
			if (options.invalidBranch === true) {
				throw gitError('fatal: invalid branch', `fatal: '${args[2]}' is not a valid branch name`);
			}

			return { stdout: `${args[2]}\n`, stderr: '' };
		}

		if (args[0] === 'worktree' && args[1] === 'list' && args[2] === '--porcelain') {
			return { stdout: options.worktreeList ?? '', stderr: '' };
		}

		if (args[0] === 'show-ref') {
			if (options.branchExists === true) {
				return { stdout: '', stderr: '' };
			}

			throw gitError('not found');
		}

		if (args[0] === 'worktree' && args[1] === 'add') {
			if (options.addFails === true) {
				throw gitError('worktree add failed', 'fatal: could not create worktree');
			}

			return { stdout: '', stderr: '' };
		}

		throw new Error(`unexpected git command: ${args.join(' ')}`);
	};

	return { git, calls };
}

function findCall(calls: readonly GitCall[], ...prefix: readonly string[]): GitCall | undefined {
	return calls.find(call => prefix.every((part, index) => call.args[index] === part));
}

function gitError(message: string, stderr = ''): Error {
	const error = new Error(message) as Error & { stderr?: string };
	error.stderr = stderr;
	return error;
}
