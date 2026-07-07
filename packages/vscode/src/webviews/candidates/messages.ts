export interface CandidateSummary {
	readonly id: string;
	readonly title: string;
	readonly filePath?: string;
	readonly workspace?: string;
}

export type BootstrapProvider = 'claude' | 'codex';

export interface CandidateRenderDiagnostic {
	readonly candidateCount: number;
	readonly cardCount: number;
	readonly emptyVisible: boolean;
	readonly bootstrapAction: 'bootstrap' | 'audit';
	readonly bootstrapProvider?: BootstrapProvider;
	readonly providerSelectorVisible: boolean;
}

export type HostToWebview =
	| {
		kind: 'state';
		candidates: readonly CandidateSummary[];
		installedProviders: readonly BootstrapProvider[];
		hasAcceptedRecords: boolean;
		diagnosticsEnabled?: boolean;
	}
	| { kind: 'diagnosticClickCandidate'; id: string; target: 'title' | 'preview' }
	| { kind: 'diagnosticSelectProvider'; provider: BootstrapProvider };

export type CandidateCommandKind = 'preview' | 'edit' | 'open' | 'accept' | 'reject' | 'retire' | 'dismiss';
export type SimpleCandidateCommandKind = Exclude<CandidateCommandKind, 'reject' | 'retire'>;

export type WebviewToHost =
	| { kind: SimpleCandidateCommandKind; id: string; filePath?: string }
	| { kind: 'reject'; id: string; filePath?: string; reason: string }
	| { kind: 'retire'; id: string; filePath?: string; retiredBy: string }
	| { kind: 'requestRefresh' }
	| { kind: 'bootstrap'; provider: BootstrapProvider }
	| { kind: 'rendered'; diagnostic: CandidateRenderDiagnostic };

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		candidates?: unknown;
		installedProviders?: unknown;
		hasAcceptedRecords?: unknown;
		diagnosticsEnabled?: unknown;
		id?: unknown;
		target?: unknown;
		provider?: unknown;
	};
	if (message.kind === 'diagnosticClickCandidate') {
		return typeof message.id === 'string'
			&& (message.target === 'title' || message.target === 'preview');
	}

	if (message.kind === 'diagnosticSelectProvider') {
		return isBootstrapProvider(message.provider);
	}

	return message.kind === 'state'
		&& Array.isArray(message.candidates)
		&& Array.isArray(message.installedProviders)
		&& message.installedProviders.every(isBootstrapProvider)
		&& typeof message.hasAcceptedRecords === 'boolean'
		&& (message.diagnosticsEnabled === undefined || typeof message.diagnosticsEnabled === 'boolean')
		&& message.candidates.every(isCandidateSummary);
}

function isBootstrapProvider(value: unknown): value is BootstrapProvider {
	return value === 'claude' || value === 'codex';
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
		provider?: unknown;
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

	if (message.kind === 'bootstrap') {
		return isBootstrapProvider(message.provider);
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
		bootstrapAction?: unknown;
		bootstrapProvider?: unknown;
		providerSelectorVisible?: unknown;
	};
	return typeof diagnostic.candidateCount === 'number'
		&& typeof diagnostic.cardCount === 'number'
		&& typeof diagnostic.emptyVisible === 'boolean'
		&& (diagnostic.bootstrapAction === 'bootstrap' || diagnostic.bootstrapAction === 'audit')
		&& (diagnostic.bootstrapProvider === undefined || isBootstrapProvider(diagnostic.bootstrapProvider))
		&& typeof diagnostic.providerSelectorVisible === 'boolean';
}
