import * as assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';
import { initStore, loadStorePaths, type StorePaths } from '../core/store';
import { createSpec } from '../core/specs';
import {
	createManagedSpecWorktree,
	ensureManagedWorktreeExclude,
	finishManagedSpecWorktree,
	listManagedSpecWorktrees,
	parseGitWorktreePorcelain,
	preflightManagedSpecWorktree,
	readProposedCommitMessage,
} from '../core/worktrees';

const execFileAsync = promisify(execFile);

describe('managed spec worktrees', () => {
	test('parses complete porcelain state and proposed commit messages', () => {
		assert.deepEqual(parseGitWorktreePorcelain([
			'worktree /repo',
			'HEAD 111',
			'branch refs/heads/main',
			'locked maintenance',
			'',
			'worktree /repo/linked',
			'HEAD 222',
			'detached',
			'prunable gitdir file points to non-existent location',
			'',
		].join('\n')), [
			{ worktreePath: '/repo', head: '111', branch: 'main', detached: false, locked: true, prunable: false },
			{ worktreePath: '/repo/linked', head: '222', detached: true, locked: false, prunable: true },
		]);
		assert.equal(readProposedCommitMessage([
			'# Spec',
			'',
			'## Proposed Commit Message',
			'',
			'Implement deterministic worktrees',
			'',
			'with guarded finish',
			'',
			'## Test Log',
		].join('\n')), 'Implement deterministic worktrees\n\nwith guarded finish');
	});

	test('adds the common exclude exactly once without replacing existing content', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-exclude-'));
		const common = path.join(root, '.git');
		await fs.mkdir(path.join(common, 'info'), { recursive: true });
		const exclude = path.join(common, 'info', 'exclude');
		await fs.writeFile(exclude, 'existing-rule\n', 'utf8');

		await ensureManagedWorktreeExclude(common);
		await ensureManagedWorktreeExclude(common);

		assert.equal(await fs.readFile(exclude, 'utf8'), 'existing-rule\n.sundial-worktrees/\n');
	});

	test('creates a deterministic nested worktree and reports primary and active topology', async () => {
		const fixture = await createRepository('create');
		const created = await createManagedSpecWorktree(fixture.paths, fixture.specId);

		assert.equal(created.branch, fixture.specName);
		assert.equal(created.worktreePath, path.join(await fs.realpath(fixture.root), '.sundial-worktrees', fixture.specName));
		assert.equal((await listManagedSpecWorktrees(fixture.paths)).specs[0]?.state.kind, 'associatedElsewhere');

		const linkedPaths = await loadStorePaths(created.worktreePath);
		const linkedTopology = await listManagedSpecWorktrees(linkedPaths);
		assert.equal(linkedTopology.activeIsPrimary, false);
		assert.equal(linkedTopology.specs[0]?.state.kind, 'associatedActive');
		assert.match(await fs.readFile(path.join(fixture.root, '.git', 'info', 'exclude'), 'utf8'), /^\.sundial-worktrees\/$/m);
	});

	test('commits dirty feature work, rebases, fast-forwards, removes the worktree, and retains the branch', async () => {
		const fixture = await createRepository('finish');
		const created = await createManagedSpecWorktree(fixture.paths, fixture.specId);
		await fs.writeFile(path.join(created.worktreePath, 'feature.txt'), 'feature\n', 'utf8');
		await fs.appendFile(
			path.join(created.worktreePath, 'sundial', 'specs', `${fixture.specName}.md`),
			'\n## Proposed Commit Message\n\nFinish managed worktree\n',
			'utf8',
		);

		const preflight = await preflightManagedSpecWorktree(fixture.paths, fixture.specId);
		assert.equal(preflight.kind, 'ready');
		assert.equal(preflight.kind === 'ready' && preflight.needsWorktreeCommitMessage, true);
		assert.equal(preflight.kind === 'ready' && preflight.suggestedWorktreeCommitMessage, 'Finish managed worktree');
		assert.equal(preflight.kind, 'ready');
		if (preflight.kind !== 'ready') {
			return;
		}

		const result = await finishManagedSpecWorktree(fixture.paths, fixture.specId, {
			expectedPrimaryHead: preflight.primaryHead,
			expectedWorktreeHead: preflight.worktreeHead,
			worktreeCommitMessage: preflight.suggestedWorktreeCommitMessage,
		});

		assert.equal(result.kind, 'completed');
		await assert.rejects(fs.access(created.worktreePath));
		assert.equal((await git(fixture.root, ['show-ref', '--verify', `refs/heads/${fixture.specName}`])).stdout.length > 0, true);
		assert.equal(await fs.readFile(path.join(fixture.root, 'feature.txt'), 'utf8'), 'feature\n');
	});

	test('leaves a conflicting rebase recoverable and finishes on a fresh attempt after external resolution', async () => {
		const fixture = await createRepository('conflict');
		const created = await createManagedSpecWorktree(fixture.paths, fixture.specId);
		await fs.writeFile(path.join(fixture.root, 'shared.txt'), 'primary\n', 'utf8');
		await fs.writeFile(path.join(created.worktreePath, 'shared.txt'), 'feature\n', 'utf8');

		const preflight = await preflightManagedSpecWorktree(fixture.paths, fixture.specId);
		assert.equal(preflight.kind, 'ready');
		if (preflight.kind !== 'ready') {
			return;
		}
		const conflicted = await finishManagedSpecWorktree(fixture.paths, fixture.specId, {
			expectedPrimaryHead: preflight.primaryHead,
			expectedWorktreeHead: preflight.worktreeHead,
			primaryCommitMessage: 'Change shared file on primary',
			worktreeCommitMessage: 'Change shared file in feature',
		});
		assert.equal(conflicted.kind, 'conflicts');
		assert.deepEqual(conflicted.kind === 'conflicts' ? conflicted.conflictPaths : [], ['shared.txt']);

		const repeated = await preflightManagedSpecWorktree(fixture.paths, fixture.specId);
		assert.equal(repeated.kind, 'conflicts');
		await fs.writeFile(path.join(created.worktreePath, 'shared.txt'), 'resolved\n', 'utf8');
		await git(created.worktreePath, ['add', 'shared.txt']);
		await git(created.worktreePath, ['-c', 'core.editor=true', 'rebase', '--continue']);

		const resumed = await preflightManagedSpecWorktree(fixture.paths, fixture.specId);
		assert.equal(resumed.kind, 'ready');
		if (resumed.kind !== 'ready') {
			return;
		}
		const completed = await finishManagedSpecWorktree(fixture.paths, fixture.specId, {
			expectedPrimaryHead: resumed.primaryHead,
			expectedWorktreeHead: resumed.worktreeHead,
		});
		assert.equal(completed.kind, 'completed');
		assert.equal(await fs.readFile(path.join(fixture.root, 'shared.txt'), 'utf8'), 'resolved\n');
	});
});

async function createRepository(label: string): Promise<{
	readonly root: string;
	readonly paths: StorePaths;
	readonly specId: string;
	readonly specName: string;
}> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), `sundial-worktree-${label}-`));
	await git(root, ['init', '-b', 'main']);
	await git(root, ['config', 'user.name', 'Sundial Test']);
	await git(root, ['config', 'user.email', 'sundial@example.test']);
	const { paths } = await initStore(root);
	const created = await createSpec(paths, {
		title: `${label} worktree`,
		status: 'Active',
		author: 'test',
		created: '2026-07-23',
	});
	await fs.writeFile(path.join(root, 'shared.txt'), 'base\n', 'utf8');
	await git(root, ['add', '-A']);
	await git(root, ['commit', '-m', 'Initial repository']);
	return {
		root,
		paths,
		specId: created.spec.id,
		specName: path.basename(created.spec.filePath, '.md'),
	};
}

async function git(cwd: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string }> {
	const result = await execFileAsync('git', [...args], { cwd, encoding: 'utf8' });
	return { stdout: result.stdout, stderr: result.stderr };
}
