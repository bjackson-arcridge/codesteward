export interface CandidateSummary {
	readonly id: string;
	readonly title: string;
	readonly filePath?: string;
	readonly workspace?: string;
}

export interface CandidateRenderDiagnostic {
	readonly candidateCount: number;
	readonly cardCount: number;
	readonly emptyVisible: boolean;
}

export type HostToWebview =
	| {
		kind: 'state';
		candidates: readonly CandidateSummary[];
		diagnosticsEnabled?: boolean;
	}
	| { kind: 'diagnosticClickCandidate'; id: string; target: 'title' };

export type CandidateCommandKind = 'preview' | 'edit' | 'open' | 'accept' | 'reject' | 'retire' | 'dismiss';
export type SimpleCandidateCommandKind = Exclude<CandidateCommandKind, 'reject' | 'retire'>;

export type WebviewToHost =
	| { kind: SimpleCandidateCommandKind; id: string; filePath?: string }
	| { kind: 'reject'; id: string; filePath?: string; reason: string }
	| { kind: 'retire'; id: string; filePath?: string; retiredBy: string }
	| { kind: 'requestRefresh' }
	| { kind: 'rendered'; diagnostic: CandidateRenderDiagnostic };

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		candidates?: unknown;
		diagnosticsEnabled?: unknown;
		id?: unknown;
		target?: unknown;
	};
	if (message.kind === 'diagnosticClickCandidate') {
		return typeof message.id === 'string'
			&& message.target === 'title';
	}

	return message.kind === 'state'
		&& Array.isArray(message.candidates)
		&& (message.diagnosticsEnabled === undefined || typeof message.diagnosticsEnabled === 'boolean')
		&& message.candidates.every(isCandidateSummary);
}

function isCandidateSummary(value: unknown): value is CandidateSummary {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as { id?: unknown; title?: unknown; filePath?: unknown; workspace?: unknown };
	return typeof candidate.id === 'string'
		&& typeof candidate.title === 'string'
		&& (candidate.filePath === undefined || typeof candidate.filePath === 'string')
		&& (candidate.workspace === undefined || typeof candidate.workspace === 'string');
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		id?: unknown;
		filePath?: unknown;
		reason?: unknown;
		retiredBy?: unknown;
		diagnostic?: unknown;
	};
	if (
		message.kind === 'preview'
		|| message.kind === 'edit'
		|| message.kind === 'open'
		|| message.kind === 'accept'
		|| message.kind === 'dismiss'
	) {
		return typeof message.id === 'string'
			&& (message.filePath === undefined || typeof message.filePath === 'string');
	}

	if (message.kind === 'reject') {
		return typeof message.id === 'string'
			&& (message.filePath === undefined || typeof message.filePath === 'string')
			&& typeof message.reason === 'string';
	}

	if (message.kind === 'retire') {
		return typeof message.id === 'string'
			&& (message.filePath === undefined || typeof message.filePath === 'string')
			&& typeof message.retiredBy === 'string';
	}

	if (message.kind === 'rendered') {
		return isCandidateRenderDiagnostic(message.diagnostic);
	}

	return message.kind === 'requestRefresh';
}

function isCandidateRenderDiagnostic(value: unknown): value is CandidateRenderDiagnostic {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const diagnostic = value as {
		candidateCount?: unknown;
		cardCount?: unknown;
		emptyVisible?: unknown;
	};
	return typeof diagnostic.candidateCount === 'number'
		&& typeof diagnostic.cardCount === 'number'
		&& typeof diagnostic.emptyVisible === 'boolean';
}
