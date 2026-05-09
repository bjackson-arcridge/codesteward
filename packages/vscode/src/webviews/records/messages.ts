export interface RecordSummary {
	readonly id: string;
	readonly title: string;
	readonly domain: string;
	readonly tags: readonly string[];
	readonly enabled: boolean;
	readonly workspace?: string;
}

export type RecordActionMode = 'accepted' | 'rejected' | 'retired';

export interface RecordRenderDiagnostic {
	readonly recordCount: number;
	readonly cardCount: number;
	readonly emptyVisible: boolean;
	readonly domainFilter?: string;
	readonly tagFilter?: string;
	readonly domainSelectOptionCount?: number;
	readonly tagSelectOptionCount?: number;
}

export type HostToWebview =
	| {
		kind: 'state';
		records: readonly RecordSummary[];
		domainFilter?: string;
		tagFilter?: string;
		domainOptions?: readonly string[];
		tagOptions?: readonly string[];
		actionMode?: RecordActionMode;
		emptyText?: string;
		diagnosticsEnabled?: boolean;
	}
	| { kind: 'diagnosticSelectFilter'; filter: 'domain' | 'tag'; value?: string };

export type WebviewToHost =
	| { kind: 'preview'; id: string }
	| { kind: 'edit'; id: string }
	| { kind: 'setDomainFilter'; domainFilter?: string }
	| { kind: 'setTagFilter'; tagFilter?: string }
	| { kind: 'toggleEnabled'; id: string; enabled: boolean }
	| { kind: 'retire'; id: string; retiredBy: string }
	| { kind: 'promote'; id: string }
	| { kind: 'delete'; id: string }
	| { kind: 'filterByTag' }
	| { kind: 'clearTagFilter' }
	| { kind: 'clearFilters' }
	| { kind: 'requestRefresh' }
	| { kind: 'rendered'; diagnostic: RecordRenderDiagnostic };

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		records?: unknown;
		domainFilter?: unknown;
		tagFilter?: unknown;
		domainOptions?: unknown;
		tagOptions?: unknown;
		actionMode?: unknown;
		emptyText?: unknown;
		diagnosticsEnabled?: unknown;
		filter?: unknown;
		value?: unknown;
	};

	if (message.kind === 'diagnosticSelectFilter') {
		return (message.filter === 'domain' || message.filter === 'tag')
			&& (message.value === undefined || typeof message.value === 'string');
	}

	if (message.kind !== 'state' || !Array.isArray(message.records)) {
		return false;
	}

	if (message.domainFilter !== undefined && typeof message.domainFilter !== 'string') {
		return false;
	}

	if (message.tagFilter !== undefined && typeof message.tagFilter !== 'string') {
		return false;
	}

	if (message.domainOptions !== undefined && !isStringArray(message.domainOptions)) {
		return false;
	}

	if (message.tagOptions !== undefined && !isStringArray(message.tagOptions)) {
		return false;
	}

	if (message.actionMode !== undefined && !isRecordActionMode(message.actionMode)) {
		return false;
	}

	if (message.emptyText !== undefined && typeof message.emptyText !== 'string') {
		return false;
	}

	if (message.diagnosticsEnabled !== undefined && typeof message.diagnosticsEnabled !== 'boolean') {
		return false;
	}

	return message.records.every(isRecordSummary);
}

function isRecordSummary(value: unknown): value is RecordSummary {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const record = value as { id?: unknown; title?: unknown; domain?: unknown; tags?: unknown; enabled?: unknown; workspace?: unknown };
	return typeof record.id === 'string'
		&& typeof record.title === 'string'
		&& typeof record.domain === 'string'
		&& Array.isArray(record.tags)
		&& record.tags.every(tag => typeof tag === 'string')
		&& typeof record.enabled === 'boolean'
		&& (record.workspace === undefined || typeof record.workspace === 'string');
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		id?: unknown;
		diagnostic?: unknown;
		domainFilter?: unknown;
		tagFilter?: unknown;
		enabled?: unknown;
		retiredBy?: unknown;
	};
	if (message.kind === 'preview'
		|| message.kind === 'edit'
		|| message.kind === 'promote'
		|| message.kind === 'delete'
	) {
		return typeof message.id === 'string';
	}

	if (message.kind === 'retire') {
		return typeof message.id === 'string' && typeof message.retiredBy === 'string';
	}

	if (message.kind === 'toggleEnabled') {
		return typeof message.id === 'string' && typeof message.enabled === 'boolean';
	}

	if (message.kind === 'setDomainFilter') {
		return message.domainFilter === undefined || typeof message.domainFilter === 'string';
	}

	if (message.kind === 'setTagFilter') {
		return message.tagFilter === undefined || typeof message.tagFilter === 'string';
	}

	if (message.kind === 'rendered') {
		return isRecordRenderDiagnostic(message.diagnostic);
	}

	return message.kind === 'filterByTag'
		|| message.kind === 'clearTagFilter'
		|| message.kind === 'clearFilters'
		|| message.kind === 'requestRefresh';
}

function isRecordRenderDiagnostic(value: unknown): value is RecordRenderDiagnostic {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const diagnostic = value as {
		recordCount?: unknown;
		cardCount?: unknown;
		emptyVisible?: unknown;
		domainFilter?: unknown;
		tagFilter?: unknown;
		domainSelectOptionCount?: unknown;
		tagSelectOptionCount?: unknown;
	};
	return typeof diagnostic.recordCount === 'number'
		&& typeof diagnostic.cardCount === 'number'
		&& typeof diagnostic.emptyVisible === 'boolean'
		&& (diagnostic.domainFilter === undefined || typeof diagnostic.domainFilter === 'string')
		&& (diagnostic.tagFilter === undefined || typeof diagnostic.tagFilter === 'string')
		&& (diagnostic.domainSelectOptionCount === undefined || typeof diagnostic.domainSelectOptionCount === 'number')
		&& (diagnostic.tagSelectOptionCount === undefined || typeof diagnostic.tagSelectOptionCount === 'number');
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isRecordActionMode(value: unknown): value is RecordActionMode {
	return value === 'accepted' || value === 'rejected' || value === 'retired';
}
