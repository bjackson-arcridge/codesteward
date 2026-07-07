export interface RecordSummary {
	readonly id: string;
	readonly title: string;
	readonly domain: string;
	readonly enabled: boolean;
	readonly summary?: string;
	readonly status?: string;
	readonly workspace?: string;
}

export interface SpecRecordGroup {
	readonly status: string;
	readonly collapsed?: boolean;
	readonly records: readonly RecordSummary[];
}

export type RecordActionMode = 'accepted' | 'rejected' | 'retired' | 'research' | 'specs';

export interface RecordRenderDiagnostic {
	readonly recordCount: number;
	readonly cardCount: number;
	readonly emptyVisible: boolean;
	readonly domainFilter?: string;
	readonly domainSelectOptionCount?: number;
	readonly groupCount?: number;
	readonly openBoardButtonVisible?: boolean;
}

export type HostToWebview =
	| {
		kind: 'state';
		records: readonly RecordSummary[];
		domainFilter?: string;
		domainOptions?: readonly string[];
		specGroups?: readonly SpecRecordGroup[];
		actionMode?: RecordActionMode;
		emptyText?: string;
		diagnosticsEnabled?: boolean;
	}
	| { kind: 'diagnosticSelectFilter'; filter: 'domain'; value?: string }
	| { kind: 'diagnosticClickRecord'; id: string; target: 'title' | 'preview' };

export type WebviewToHost =
	| { kind: 'preview'; id: string }
	| { kind: 'edit'; id: string }
	| { kind: 'openBoard' }
	| { kind: 'setDomainFilter'; domainFilter?: string }
	| { kind: 'toggleSpecGroup'; status: string; collapsed: boolean }
	| { kind: 'toggleEnabled'; id: string; enabled: boolean }
	| { kind: 'retire'; id: string; retiredBy: string }
	| { kind: 'promote'; id: string }
	| { kind: 'delete'; id: string }
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
		domainOptions?: unknown;
		specGroups?: unknown;
		actionMode?: unknown;
		emptyText?: unknown;
		diagnosticsEnabled?: unknown;
		filter?: unknown;
		value?: unknown;
		id?: unknown;
		target?: unknown;
	};

	if (message.kind === 'diagnosticClickRecord') {
		return typeof message.id === 'string'
			&& (message.target === 'title' || message.target === 'preview');
	}

	if (message.kind === 'diagnosticSelectFilter') {
		return message.filter === 'domain'
			&& (message.value === undefined || typeof message.value === 'string');
	}

	if (message.kind !== 'state' || !Array.isArray(message.records)) {
		return false;
	}

	if (message.domainFilter !== undefined && typeof message.domainFilter !== 'string') {
		return false;
	}

	if (message.domainOptions !== undefined && !isStringArray(message.domainOptions)) {
		return false;
	}

	if (message.specGroups !== undefined && !isSpecRecordGroupArray(message.specGroups)) {
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

	const record = value as {
		id?: unknown;
		title?: unknown;
		domain?: unknown;
		enabled?: unknown;
		summary?: unknown;
		status?: unknown;
		workspace?: unknown;
	};
	return typeof record.id === 'string'
		&& typeof record.title === 'string'
		&& typeof record.domain === 'string'
		&& typeof record.enabled === 'boolean'
		&& (record.summary === undefined || typeof record.summary === 'string')
		&& (record.status === undefined || typeof record.status === 'string')
		&& (record.workspace === undefined || typeof record.workspace === 'string');
}

function isSpecRecordGroupArray(value: unknown): value is readonly SpecRecordGroup[] {
	return Array.isArray(value) && value.every(isSpecRecordGroup);
}

function isSpecRecordGroup(value: unknown): value is SpecRecordGroup {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const group = value as {
		status?: unknown;
		collapsed?: unknown;
		records?: unknown;
	};

	return typeof group.status === 'string'
		&& (group.collapsed === undefined || typeof group.collapsed === 'boolean')
		&& Array.isArray(group.records)
		&& group.records.every(isRecordSummary);
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
		enabled?: unknown;
		retiredBy?: unknown;
		status?: unknown;
		collapsed?: unknown;
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

	if (message.kind === 'toggleSpecGroup') {
		return typeof message.status === 'string' && typeof message.collapsed === 'boolean';
	}

	if (message.kind === 'rendered') {
		return isRecordRenderDiagnostic(message.diagnostic);
	}

	return message.kind === 'clearFilters'
		|| message.kind === 'openBoard'
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
		domainSelectOptionCount?: unknown;
		groupCount?: unknown;
		openBoardButtonVisible?: unknown;
	};
	return typeof diagnostic.recordCount === 'number'
		&& typeof diagnostic.cardCount === 'number'
		&& typeof diagnostic.emptyVisible === 'boolean'
		&& (diagnostic.domainFilter === undefined || typeof diagnostic.domainFilter === 'string')
		&& (diagnostic.domainSelectOptionCount === undefined || typeof diagnostic.domainSelectOptionCount === 'number')
		&& (diagnostic.groupCount === undefined || typeof diagnostic.groupCount === 'number')
		&& (diagnostic.openBoardButtonVisible === undefined || typeof diagnostic.openBoardButtonVisible === 'boolean');
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isRecordActionMode(value: unknown): value is RecordActionMode {
	return value === 'accepted' || value === 'rejected' || value === 'retired' || value === 'research' || value === 'specs';
}
