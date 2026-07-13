import { isSpecSessionPhase, type SpecSessionPhase } from '../../specSessions';

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
export type RecordClickTarget = 'title' | 'preview' | 'delete' | SpecSessionPhase;

export interface RecordRenderDiagnostic {
	readonly recordCount: number;
	readonly cardCount: number;
	readonly emptyVisible: boolean;
	readonly domainFilter?: string;
	readonly domainSelectOptionCount?: number;
	readonly groupCount?: number;
	readonly openBoardButtonVisible?: boolean;
	readonly specAddFormVisible?: boolean;
	readonly specDeleteActionCount?: number;
}

export type HostToWebview =
	| {
		kind: 'state';
		records: readonly RecordSummary[];
		domainFilter?: string;
		domainOptions?: readonly string[];
		specGroups?: readonly SpecRecordGroup[];
		specStatusOptions?: readonly string[];
		workspaces?: readonly string[];
		actionMode?: RecordActionMode;
		emptyText?: string;
		diagnosticsEnabled?: boolean;
	}
	| { kind: 'diagnosticSelectFilter'; filter: 'domain'; value?: string }
	| { kind: 'diagnosticClickRecord'; id: string; target: RecordClickTarget; workspace?: string }
	| { kind: 'diagnosticCreateSpec'; title: string; status?: string; workspace?: string }
	| { kind: 'diagnosticMoveSpec'; id: string; status: string; workspace?: string }
	| { kind: 'diagnosticDeleteSpec'; id: string; workspace?: string; skipConfirmation?: boolean };

export type WebviewToHost =
	| { kind: 'preview'; id: string }
	| { kind: 'edit'; id: string }
	| { kind: 'openBoard' }
	| { kind: 'createSpec'; title: string; status: string; workspace?: string }
	| { kind: 'moveSpec'; id: string; status: string; workspace?: string }
	| { kind: 'deleteSpec'; id: string; workspace?: string; skipConfirmation?: boolean }
	| { kind: 'launchSpec'; id: string; phase: SpecSessionPhase; workspace?: string }
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
		specStatusOptions?: unknown;
		workspaces?: unknown;
		actionMode?: unknown;
		emptyText?: unknown;
		diagnosticsEnabled?: unknown;
		filter?: unknown;
		value?: unknown;
		id?: unknown;
		target?: unknown;
		title?: unknown;
		status?: unknown;
		workspace?: unknown;
		skipConfirmation?: unknown;
		phase?: unknown;
	};

	if (message.kind === 'diagnosticCreateSpec') {
		return typeof message.title === 'string'
			&& (message.status === undefined || typeof message.status === 'string')
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'diagnosticMoveSpec') {
		return typeof message.id === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'diagnosticDeleteSpec') {
		return typeof message.id === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string')
			&& (message.skipConfirmation === undefined || typeof message.skipConfirmation === 'boolean');
	}

	if (message.kind === 'diagnosticClickRecord') {
		return typeof message.id === 'string'
			&& isRecordClickTarget(message.target)
			&& (message.workspace === undefined || typeof message.workspace === 'string');
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

	if (message.specStatusOptions !== undefined && !isStringArray(message.specStatusOptions)) {
		return false;
	}

	if (message.workspaces !== undefined && !isStringArray(message.workspaces)) {
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
		skipConfirmation?: unknown;
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
		title?: unknown;
		workspace?: unknown;
		skipConfirmation?: unknown;
		phase?: unknown;
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

	if (message.kind === 'createSpec') {
		return typeof message.title === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'moveSpec') {
		return typeof message.id === 'string'
			&& typeof message.status === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string');
	}

	if (message.kind === 'deleteSpec') {
		return typeof message.id === 'string'
			&& (message.workspace === undefined || typeof message.workspace === 'string')
			&& (message.skipConfirmation === undefined || typeof message.skipConfirmation === 'boolean');
	}

	if (message.kind === 'launchSpec') {
		return typeof message.id === 'string'
			&& isSpecSessionPhase(message.phase)
			&& (message.workspace === undefined || typeof message.workspace === 'string');
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
		specAddFormVisible?: unknown;
		specDeleteActionCount?: unknown;
	};
	return typeof diagnostic.recordCount === 'number'
		&& typeof diagnostic.cardCount === 'number'
		&& typeof diagnostic.emptyVisible === 'boolean'
		&& (diagnostic.domainFilter === undefined || typeof diagnostic.domainFilter === 'string')
		&& (diagnostic.domainSelectOptionCount === undefined || typeof diagnostic.domainSelectOptionCount === 'number')
		&& (diagnostic.groupCount === undefined || typeof diagnostic.groupCount === 'number')
		&& (diagnostic.openBoardButtonVisible === undefined || typeof diagnostic.openBoardButtonVisible === 'boolean')
		&& (diagnostic.specAddFormVisible === undefined || typeof diagnostic.specAddFormVisible === 'boolean')
		&& (diagnostic.specDeleteActionCount === undefined || typeof diagnostic.specDeleteActionCount === 'number');
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isRecordClickTarget(value: unknown): value is RecordClickTarget {
	return value === 'title'
		|| value === 'preview'
		|| value === 'delete'
		|| isSpecSessionPhase(value);
}

function isRecordActionMode(value: unknown): value is RecordActionMode {
	return value === 'accepted' || value === 'rejected' || value === 'retired' || value === 'research' || value === 'specs';
}
