import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	cardWorktreeStates,
	formatRebaseRecoveryPrompt,
	parseWorktreeCreated,
	parseWorktreeFinish,
	parseWorktreePreflight,
	parseWorktreeTopology,
} from '../specWorktrees';

describe('spec worktree CLI contracts', () => {
	test('parses topology and derives whether an elsewhere worktree can finish', () => {
		const topology = parseWorktreeTopology(JSON.stringify({
			version: 1,
			kind: 'topology',
			primaryPath: '/repo',
			activePath: '/repo',
			activeIsPrimary: true,
			specs: [
				{ id: 'SPEC-0001', state: { kind: 'none' } },
				{
					id: 'SPEC-0002',
					state: {
						kind: 'associatedElsewhere',
						worktreePath: '/repo/.sundial-worktrees/SPEC-0002-feature',
						primaryPath: '/repo',
						branch: 'SPEC-0002-feature',
					},
				},
			],
		}));

		assert.deepEqual(cardWorktreeStates(topology).get('SPEC-0002'), {
			kind: 'associatedElsewhere',
			worktreePath: '/repo/.sundial-worktrees/SPEC-0002-feature',
			primaryPath: '/repo',
			branch: 'SPEC-0002-feature',
			canFinish: true,
		});
	});

	test('rejects malformed or unsupported CLI results', () => {
		assert.throws(() => parseWorktreeTopology('{}'), /unsupported/);
		assert.throws(() => parseWorktreeCreated('not json'), /invalid JSON/);
		assert.throws(() => parseWorktreePreflight(JSON.stringify({ version: 2, kind: 'ready' })), /unsupported/);
		assert.throws(() => parseWorktreeFinish(JSON.stringify({ version: 1, kind: 'ready' })), /unsupported/);
	});

	test('parses create, preflight, and finish result variants', () => {
		assert.equal(parseWorktreeCreated(JSON.stringify({
			version: 1,
			kind: 'created',
			specId: 'SPEC-0002',
			primaryPath: '/repo',
			worktreePath: '/repo/.sundial-worktrees/SPEC-0002-feature',
			branch: 'SPEC-0002-feature',
		})).kind, 'created');

		assert.equal(parseWorktreePreflight(JSON.stringify({
			version: 1,
			kind: 'blocked',
			specId: 'SPEC-0002',
			message: 'blocked',
		})).kind, 'blocked');

		assert.equal(parseWorktreeFinish(JSON.stringify({
			version: 1,
			kind: 'completed',
			specId: 'SPEC-0002',
			primaryPath: '/repo',
			removedWorktreePath: '/repo/.sundial-worktrees/SPEC-0002-feature',
			branch: 'SPEC-0002-feature',
			head: 'abc',
		})).kind, 'completed');
	});

	test('formats a bounded prompt that leaves merge and cleanup to Sundial', () => {
		const prompt = formatRebaseRecoveryPrompt({
			version: 1,
			kind: 'conflicts',
			specId: 'SPEC-0002',
			primaryPath: '/repo',
			worktreePath: '/repo/.sundial-worktrees/SPEC-0002-feature',
			primaryBranch: 'main',
			featureBranch: 'SPEC-0002-feature',
			conflictPaths: ['src/one.ts', 'src/two.ts'],
		});

		assert.match(prompt, /Work only inside this managed worktree/);
		assert.match(prompt, /git rebase --continue/);
		assert.match(prompt, /Do not merge branches/);
		assert.match(prompt, /src\/one\.ts/);
		assert.ok(prompt.length <= 16_384);
	});
});
