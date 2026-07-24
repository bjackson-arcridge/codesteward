import { isSpecSessionPhase, type SpecSessionPhase } from '../../specSessions';
import type { SpecWorktreeState } from '../../specWorktrees';

export interface SpecCard {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly workspace?: string;
	readonly worktree: SpecWorktreeState;
}

export type SpecWorktreeAction = 'createWorktree' | 'openWorktree' | 'returnPrimary' | 'finishWorktree' | 'showWorktreeError';
export type SpecCardActionTarget = 'open' | SpecWorktreeAction | 'archive' | 'delete' | SpecSessionPhase;

export interface SpecsRenderDiagnostic {
	readonly laneCount: number;
	readonly specCount: number;
	readonly cardCount: number;
	readonly emptyVisible: boolean;
	readonly worktreeActionCount?: number;
}

export type HostToWebview =
	| {
		kind: 'state';
		lanes: readonly string[];
		specs: readonly SpecCard[];
		workspaces?: readonly string[];
		diagnosticsEnabled?: boolean;
	}
	| { kind: 'diagnosticClickSpec'; id: string; workspace?: string; target: SpecCardActionTarget }
	| { kind: 'diagnosticCreateSpec'; title: string; status: string; workspace?: string }
	| { kind: 'diagnosticMoveSpec'; id: string; status: string; workspace?: string }
	| { kind: 'diagnosticDeleteSpec'; id: string; workspace?: string };

export type WebviewToHost =
	| { kind: 'open'; id: string; workspace?: string }
	| { kind: 'worktreeAction'; action: SpecWorktreeAction; id: string; workspace?: string }
	| { kind: 'create'; title: string; status: string; workspace?: string }
	| { kind: 'move'; id: string; status: string; workspace?: string }
	| { kind: 'delete'; id: string; workspace?: string }
	| { kind: 'launch'; id: string; phase: SpecSessionPhase; workspace?: string }
	| { kind: 'requestRefresh' }
	| { kind: 'rendered'; diagnostic: SpecsRenderDiagnostic };

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		lanes?: unknown;
		specs?: unknown;
		workspaces?: unknown;
		diagnosticsEnabled?: unknown;
		id?: unknown;
		title?: unknown;
		status?: unknown;
		workspace?: unknown;
		target?: unknown;
		phase?: unknown;
		action?: unknown;
	};

	if (message.kind === 'state') {
		return isStringArray(message.lanes)
			&& Array.isArray(message.specs)
			&& message.specs.every(isSpecCard)
			&& (message.workspaces === undefined || isStringArray(message.workspaces))
			&& (message.diagnosticsEnabled === undefined || typeof message.diagnosticsEnabled === 'boolean');
	}

	if (message.kind === 'diagnosticClickSpec') {
		return typeof message.id === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string')
			&& isSpecCardActionTarget(message.target);
	}

	if (message.kind === 'diagnosticCreateSpec') {
		return typeof message.title === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'diagnosticMoveSpec') {
		return typeof message.id === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'diagnosticDeleteSpec') {
		return typeof message.id === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	return false;
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		id?: unknown;
		title?: unknown;
		status?: unknown;
		workspace?: unknown;
		diagnostic?: unknown;
		phase?: unknown;
		action?: unknown;
	};

	if (message.kind === 'open' || message.kind === 'delete') {
		return typeof message.id === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'worktreeAction') {
		return typeof message.id === 'string'
			&& isSpecWorktreeAction(message.action)
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'launch') {
		return typeof message.id === 'string'
			&& isSpecSessionPhase(message.phase)
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'create') {
		return typeof message.title === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'move') {
		return typeof message.id === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'rendered') {
		return isSpecsRenderDiagnostic(message.diagnostic);
	}

	return message.kind === 'requestRefresh';
}

function isSpecCard(value: unknown): value is SpecCard {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const spec = value as {
		id?: unknown;
		title?: unknown;
		status?: unknown;
		workspace?: unknown;
		worktree?: unknown;
	};
	return typeof spec.id === 'string'
		&& typeof spec.title === 'string'
		&& typeof spec.status === 'string'
		&& (spec.workspace === undefined || typeof spec.workspace === 'string')
		&& isSpecWorktreeState(spec.worktree);
}

function isSpecsRenderDiagnostic(value: unknown): value is SpecsRenderDiagnostic {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const diagnostic = value as {
		laneCount?: unknown;
		specCount?: unknown;
		cardCount?: unknown;
		emptyVisible?: unknown;
		worktreeActionCount?: unknown;
	};
	return typeof diagnostic.laneCount === 'number'
		&& typeof diagnostic.specCount === 'number'
		&& typeof diagnostic.cardCount === 'number'
		&& typeof diagnostic.emptyVisible === 'boolean'
		&& (diagnostic.worktreeActionCount === undefined || typeof diagnostic.worktreeActionCount === 'number');
}

function isSpecCardActionTarget(value: unknown): value is SpecCardActionTarget {
	return value === 'open'
		|| isSpecWorktreeAction(value)
		|| value === 'archive'
		|| value === 'delete'
		|| isSpecSessionPhase(value);
}

function isSpecWorktreeAction(value: unknown): value is SpecWorktreeAction {
	return value === 'createWorktree' || value === 'openWorktree' || value === 'returnPrimary'
		|| value === 'finishWorktree' || value === 'showWorktreeError';
}

function isSpecWorktreeState(value: unknown): value is SpecWorktreeState {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const state = value as Record<string, unknown>;
	if (state.kind === 'none') {
		return true;
	}
	if (state.kind === 'error') {
		return typeof state.message === 'string';
	}
	if (state.kind !== 'associatedElsewhere' && state.kind !== 'associatedActive') {
		return false;
	}
	return typeof state.worktreePath === 'string'
		&& typeof state.primaryPath === 'string'
		&& typeof state.branch === 'string'
		&& (state.rebaseInProgress === undefined || typeof state.rebaseInProgress === 'boolean')
		&& (state.kind !== 'associatedElsewhere' || typeof state.canFinish === 'boolean');
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}
