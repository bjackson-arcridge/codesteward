export type SpecWorktreeState =
	| { readonly kind: 'none' }
	| {
		readonly kind: 'associatedElsewhere';
		readonly worktreePath: string;
		readonly primaryPath: string;
		readonly branch: string;
		readonly rebaseInProgress?: boolean;
		readonly canFinish: boolean;
	}
	| {
		readonly kind: 'associatedActive';
		readonly worktreePath: string;
		readonly primaryPath: string;
		readonly branch: string;
		readonly rebaseInProgress?: boolean;
	}
	| { readonly kind: 'error'; readonly message: string };

export interface WorktreeTopology {
	readonly version: 1;
	readonly kind: 'topology';
	readonly primaryPath: string;
	readonly activePath: string;
	readonly activeIsPrimary: boolean;
	readonly specs: readonly {
		readonly id: string;
		readonly state: Exclude<SpecWorktreeState, { readonly kind: 'associatedElsewhere' }> | {
			readonly kind: 'associatedElsewhere';
			readonly worktreePath: string;
			readonly primaryPath: string;
			readonly branch: string;
			readonly rebaseInProgress?: boolean;
		};
	}[];
}

export interface WorktreeCreated {
	readonly version: 1;
	readonly kind: 'created';
	readonly specId: string;
	readonly primaryPath: string;
	readonly worktreePath: string;
	readonly branch: string;
}

export interface WorktreeReady {
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

export interface WorktreeConflicts {
	readonly version: 1;
	readonly kind: 'conflicts';
	readonly specId: string;
	readonly primaryPath: string;
	readonly worktreePath: string;
	readonly primaryBranch: string;
	readonly featureBranch: string;
	readonly conflictPaths: readonly string[];
}

export interface WorktreeCompleted {
	readonly version: 1;
	readonly kind: 'completed';
	readonly specId: string;
	readonly primaryPath: string;
	readonly removedWorktreePath: string;
	readonly branch: string;
	readonly head: string;
}

export interface WorktreeProblem {
	readonly version: 1;
	readonly kind: 'blocked' | 'stale' | 'failed';
	readonly specId: string;
	readonly message: string;
}

export type WorktreePreflight = WorktreeReady | WorktreeConflicts | WorktreeProblem;
export type WorktreeFinish = WorktreeCompleted | WorktreeConflicts | WorktreeProblem;

export function parseWorktreeTopology(output: string): WorktreeTopology {
	const value = parseJson(output);
	if (!isWorktreeTopology(value)) {
		throw new Error('Sundial returned an unsupported worktree topology result.');
	}
	return value;
}

export function parseWorktreeCreated(output: string): WorktreeCreated {
	const value = parseJson(output);
	if (!isWorktreeCreated(value)) {
		throw new Error('Sundial returned an unsupported worktree creation result.');
	}
	return value;
}

export function parseWorktreePreflight(output: string): WorktreePreflight {
	const value = parseJson(output);
	if (!isWorktreeReady(value) && !isWorktreeConflicts(value) && !isWorktreeProblem(value, ['blocked'])) {
		throw new Error('Sundial returned an unsupported worktree preflight result.');
	}
	return value;
}

export function parseWorktreeFinish(output: string): WorktreeFinish {
	const value = parseJson(output);
	if (!isWorktreeCompleted(value) && !isWorktreeConflicts(value)
		&& !isWorktreeProblem(value, ['blocked', 'stale', 'failed'])) {
		throw new Error('Sundial returned an unsupported worktree finish result.');
	}
	return value;
}

export function cardWorktreeStates(topology: WorktreeTopology): ReadonlyMap<string, SpecWorktreeState> {
	return new Map(topology.specs.map(spec => [
		spec.id,
		spec.state.kind === 'associatedElsewhere'
			? { ...spec.state, canFinish: topology.activeIsPrimary }
			: spec.state,
	]));
}

export function formatRebaseRecoveryPrompt(result: WorktreeConflicts): string {
	const conflictList = result.conflictPaths.slice(0, 100).map(item => `- ${item}`).join('\n') || '- Inspect git status for conflicts.';
	return [
		`Resolve the in-progress Git rebase for Sundial spec ${result.specId}.`,
		`Work only inside this managed worktree: ${result.worktreePath}`,
		`The feature branch is ${result.featureBranch}; it is being rebased onto ${result.primaryBranch}.`,
		'',
		'First run `git status`. Resolve every current conflict without changing files outside this worktree, stage each resolution, then run `git rebase --continue`. Repeat until Git reports that the rebase is complete. Do not merge branches, remove the worktree, abort the rebase, or use force/reset commands. Leave final merge and cleanup to Sundial.',
		'',
		'Current conflicted paths:',
		conflictList,
	].join('\n').slice(0, 16_384);
}

function parseJson(output: string): unknown {
	try {
		return JSON.parse(output);
	} catch {
		throw new Error('Sundial returned invalid JSON for a worktree command.');
	}
}

function isWorktreeTopology(value: unknown): value is WorktreeTopology {
	if (!isObject(value) || value.version !== 1 || value.kind !== 'topology'
		|| typeof value.primaryPath !== 'string' || typeof value.activePath !== 'string'
		|| typeof value.activeIsPrimary !== 'boolean' || !Array.isArray(value.specs)) {
		return false;
	}
	return value.specs.every(spec => isObject(spec)
		&& typeof spec.id === 'string'
		&& isSpecWorktreeState(spec.state, false));
}

function isSpecWorktreeState(value: unknown, requireFinish: boolean): value is SpecWorktreeState {
	if (!isObject(value) || typeof value.kind !== 'string') {
		return false;
	}
	if (value.kind === 'none') {
		return true;
	}
	if (value.kind === 'error') {
		return typeof value.message === 'string';
	}
	if (value.kind !== 'associatedElsewhere' && value.kind !== 'associatedActive') {
		return false;
	}
	return typeof value.worktreePath === 'string'
		&& typeof value.primaryPath === 'string'
		&& typeof value.branch === 'string'
		&& (value.rebaseInProgress === undefined || typeof value.rebaseInProgress === 'boolean')
		&& (!requireFinish || value.kind !== 'associatedElsewhere' || typeof value.canFinish === 'boolean');
}

function isWorktreeCreated(value: unknown): value is WorktreeCreated {
	return isObject(value) && value.version === 1 && value.kind === 'created'
		&& typeof value.specId === 'string' && typeof value.primaryPath === 'string'
		&& typeof value.worktreePath === 'string' && typeof value.branch === 'string';
}

function isWorktreeReady(value: unknown): value is WorktreeReady {
	return isObject(value) && value.version === 1 && value.kind === 'ready'
		&& typeof value.specId === 'string' && typeof value.primaryPath === 'string'
		&& typeof value.worktreePath === 'string' && typeof value.primaryBranch === 'string'
		&& typeof value.featureBranch === 'string' && typeof value.primaryHead === 'string'
		&& typeof value.worktreeHead === 'string' && typeof value.needsPrimaryCommitMessage === 'boolean'
		&& typeof value.needsWorktreeCommitMessage === 'boolean'
		&& (value.suggestedWorktreeCommitMessage === undefined || typeof value.suggestedWorktreeCommitMessage === 'string');
}

function isWorktreeConflicts(value: unknown): value is WorktreeConflicts {
	return isObject(value) && value.version === 1 && value.kind === 'conflicts'
		&& typeof value.specId === 'string' && typeof value.primaryPath === 'string'
		&& typeof value.worktreePath === 'string' && typeof value.primaryBranch === 'string'
		&& typeof value.featureBranch === 'string' && isStringArray(value.conflictPaths);
}

function isWorktreeCompleted(value: unknown): value is WorktreeCompleted {
	return isObject(value) && value.version === 1 && value.kind === 'completed'
		&& typeof value.specId === 'string' && typeof value.primaryPath === 'string'
		&& typeof value.removedWorktreePath === 'string' && typeof value.branch === 'string'
		&& typeof value.head === 'string';
}

function isWorktreeProblem(value: unknown, kinds: readonly string[]): value is WorktreeProblem {
	return isObject(value) && value.version === 1 && typeof value.kind === 'string'
		&& kinds.includes(value.kind) && typeof value.specId === 'string' && typeof value.message === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
