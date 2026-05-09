export interface WelcomeState {
	readonly cliAvailable: boolean;
	readonly cliPath: string;
}

export interface WelcomeRenderDiagnostic {
	readonly cliAvailable: boolean;
	readonly claudeSelected: boolean;
	readonly codexSelected: boolean;
	readonly initDisabled: boolean;
}

export type HostToWebview =
	| { kind: 'state'; state: WelcomeState; diagnosticsEnabled?: boolean }
	| { kind: 'diagnosticToggleAgent'; agent: 'claude' | 'codex'; selected: boolean }
	| { kind: 'diagnosticInit' };

export type WebviewToHost =
	| { kind: 'installCli' }
	| { kind: 'init'; claude: boolean; codex: boolean }
	| { kind: 'requestRefresh' }
	| { kind: 'rendered'; diagnostic: WelcomeRenderDiagnostic };

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		state?: unknown;
		diagnosticsEnabled?: unknown;
		agent?: unknown;
		selected?: unknown;
	};

	if (message.kind === 'diagnosticToggleAgent') {
		return (message.agent === 'claude' || message.agent === 'codex')
			&& typeof message.selected === 'boolean';
	}

	if (message.kind === 'diagnosticInit') {
		return true;
	}

	if (message.kind !== 'state') {
		return false;
	}

	if (message.diagnosticsEnabled !== undefined && typeof message.diagnosticsEnabled !== 'boolean') {
		return false;
	}

	const state = message.state as { cliAvailable?: unknown; cliPath?: unknown } | undefined;
	return state !== undefined
		&& typeof state.cliAvailable === 'boolean'
		&& typeof state.cliPath === 'string';
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const message = value as {
		kind?: unknown;
		claude?: unknown;
		codex?: unknown;
		diagnostic?: unknown;
	};
	if (message.kind === 'installCli' || message.kind === 'requestRefresh') {
		return true;
	}

	if (message.kind === 'init') {
		return typeof message.claude === 'boolean'
			&& typeof message.codex === 'boolean'
			&& (message.claude || message.codex);
	}

	if (message.kind === 'rendered') {
		return isWelcomeRenderDiagnostic(message.diagnostic);
	}

	return false;
}

function isWelcomeRenderDiagnostic(value: unknown): value is WelcomeRenderDiagnostic {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const diagnostic = value as {
		cliAvailable?: unknown;
		claudeSelected?: unknown;
		codexSelected?: unknown;
		initDisabled?: unknown;
	};
	return typeof diagnostic.cliAvailable === 'boolean'
		&& typeof diagnostic.claudeSelected === 'boolean'
		&& typeof diagnostic.codexSelected === 'boolean'
		&& typeof diagnostic.initDisabled === 'boolean';
}
