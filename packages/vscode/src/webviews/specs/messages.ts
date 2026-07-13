import { isSpecSessionPhase, type SpecSessionPhase } from '../../specSessions';

export interface SpecCard {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly workspace?: string;
	readonly worktreeSpawnDisabled?: boolean;
	readonly activeWorktree?: boolean;
}

export type SpecCardActionTarget = 'open' | 'worktree' | 'archive' | 'delete' | SpecSessionPhase;

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
	| { kind: 'spawnWorktree'; id: string; workspace?: string }
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
	};

	if (message.kind === 'open' || message.kind === 'spawnWorktree' || message.kind === 'delete') {
		return typeof message.id === 'string'
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
		worktreeSpawnDisabled?: unknown;
		activeWorktree?: unknown;
	};
	return typeof spec.id === 'string'
		&& typeof spec.title === 'string'
		&& typeof spec.status === 'string'
		&& (spec.workspace === undefined || typeof spec.workspace === 'string')
		&& (spec.worktreeSpawnDisabled === undefined || typeof spec.worktreeSpawnDisabled === 'boolean')
		&& (spec.activeWorktree === undefined || typeof spec.activeWorktree === 'boolean');
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
		|| value === 'worktree'
		|| value === 'archive'
		|| value === 'delete'
		|| isSpecSessionPhase(value);
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}
