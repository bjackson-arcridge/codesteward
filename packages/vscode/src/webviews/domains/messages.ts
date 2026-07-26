export interface DomainSummary {
	readonly name: string;
	readonly description: string;
	readonly referenceCount: number;
}

export interface DomainSuggestion {
	readonly name: string;
	readonly description: string;
}

export interface DomainWorkspace {
	readonly root: string;
	readonly name: string;
}

export interface DomainsRenderDiagnostic {
	readonly selectedWorkspace?: string;
	readonly domainCount: number;
	readonly suggestionCount: number;
	readonly formVisible: boolean;
}

export type HostToWebview = {
	readonly kind: 'state';
	readonly workspaces: readonly DomainWorkspace[];
	readonly selectedWorkspace?: string;
	readonly domains: readonly DomainSummary[];
	readonly suggestions: readonly DomainSuggestion[];
	readonly busy: boolean;
	readonly error?: string;
	readonly diagnosticsEnabled?: boolean;
};

export type WebviewToHost =
	| { readonly kind: 'selectWorkspace'; readonly root: string }
	| { readonly kind: 'add'; readonly name: string; readonly description: string }
	| {
		readonly kind: 'update';
		readonly currentName: string;
		readonly name?: string;
		readonly description?: string;
	}
	| { readonly kind: 'remove'; readonly name: string }
	| { readonly kind: 'requestRefresh' }
	| { readonly kind: 'rendered'; readonly diagnostic: DomainsRenderDiagnostic };

export interface DomainsCliJson {
	readonly version: 1;
	readonly domains: readonly DomainSummary[];
	readonly suggestions: readonly DomainSuggestion[];
}

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (!isRecord(value) || value.kind !== 'state') {
		return false;
	}
	return Array.isArray(value.workspaces)
		&& value.workspaces.every(isWorkspace)
		&& (value.selectedWorkspace === undefined || typeof value.selectedWorkspace === 'string')
		&& Array.isArray(value.domains)
		&& value.domains.every(isDomain)
		&& Array.isArray(value.suggestions)
		&& value.suggestions.every(isSuggestion)
		&& typeof value.busy === 'boolean'
		&& (value.error === undefined || typeof value.error === 'string')
		&& (value.diagnosticsEnabled === undefined || typeof value.diagnosticsEnabled === 'boolean');
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
	if (!isRecord(value)) {
		return false;
	}
	switch (value.kind) {
		case 'selectWorkspace':
			return typeof value.root === 'string';
		case 'add':
			return typeof value.name === 'string' && typeof value.description === 'string';
		case 'update':
			return typeof value.currentName === 'string'
				&& (value.name === undefined || typeof value.name === 'string')
				&& (value.description === undefined || typeof value.description === 'string')
				&& (value.name !== undefined || value.description !== undefined);
		case 'remove':
			return typeof value.name === 'string';
		case 'requestRefresh':
			return true;
		case 'rendered':
			return isRenderDiagnostic(value.diagnostic);
		default:
			return false;
	}
}

export function parseDomainsCliJson(value: unknown): DomainsCliJson {
	if (!isRecord(value)
		|| value.version !== 1
		|| !Array.isArray(value.domains)
		|| !value.domains.every(isDomain)
		|| !Array.isArray(value.suggestions)
		|| !value.suggestions.every(isSuggestion)) {
		throw new Error('The Sundial CLI returned an invalid domains JSON response.');
	}
	return {
		version: 1,
		domains: value.domains,
		suggestions: value.suggestions,
	};
}

function isWorkspace(value: unknown): value is DomainWorkspace {
	return isRecord(value) && typeof value.root === 'string' && typeof value.name === 'string';
}

function isDomain(value: unknown): value is DomainSummary {
	return isRecord(value)
		&& typeof value.name === 'string'
		&& typeof value.description === 'string'
		&& typeof value.referenceCount === 'number'
		&& Number.isSafeInteger(value.referenceCount)
		&& value.referenceCount >= 0;
}

function isSuggestion(value: unknown): value is DomainSuggestion {
	return isRecord(value) && typeof value.name === 'string' && typeof value.description === 'string';
}

function isRenderDiagnostic(value: unknown): value is DomainsRenderDiagnostic {
	return isRecord(value)
		&& (value.selectedWorkspace === undefined || typeof value.selectedWorkspace === 'string')
		&& typeof value.domainCount === 'number'
		&& typeof value.suggestionCount === 'number'
		&& typeof value.formVisible === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
