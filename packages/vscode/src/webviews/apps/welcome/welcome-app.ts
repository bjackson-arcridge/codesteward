import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tokenStyles } from '../shared/styles.js';
import { connectRefreshTriggers, getHost, readInitialState } from '../shared/host.js';
import { assertNever } from '../shared/guards.js';
import {
	type HostToWebview,
	type WebviewToHost,
	type WelcomeState,
	isHostToWebview,
} from '../../welcome/messages.js';
import '../shared/components/cs-button.js';

@customElement('cs-welcome-app')
export class WelcomeApp extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: block;
				padding: 16px;
				background: var(--cs-bg);
			}

			h1 {
				margin: 0 0 8px;
				font-size: 1.1rem;
			}

			p {
				margin: 0 0 12px;
				color: var(--cs-fg-muted);
				line-height: 1.4;
			}

			.status {
				margin-bottom: 12px;
				font-size: calc(var(--vscode-font-size) - 1px);
				color: var(--cs-fg-muted);
				word-break: break-all;
			}

			fieldset.agents {
				display: flex;
				flex-direction: column;
				gap: 4px;
				margin: 0 0 12px;
				padding: 8px 10px;
				border: 1px solid var(--cs-card-border);
				border-radius: 2px;
				background: var(--cs-card-bg);
			}

			fieldset.agents legend {
				padding: 0 4px;
				font-size: calc(var(--vscode-font-size) - 1px);
				color: var(--cs-fg-muted);
			}

			fieldset.agents label {
				display: flex;
				align-items: center;
				gap: 6px;
				cursor: pointer;
			}

			fieldset.agents input[type='checkbox'] {
				accent-color: var(--cs-button-bg);
				cursor: pointer;
			}

			cs-button {
				display: flex;
				margin-bottom: 8px;
			}
		`,
	];

	private readonly host = getHost<WebviewToHost, HostToWebview>();
	private stopRefreshTriggers?: () => void;
	@state() private cliAvailable = false;
	@state() private cliPath = 'codesteward';
	@state() private claudeSelected = false;
	@state() private codexSelected = false;
	@state() private diagnosticsEnabled = false;

	connectedCallback(): void {
		super.connectedCallback();
		const persisted = this.host.getState();
		const initial = persisted !== undefined && isHostToWebview(persisted)
			? persisted
			: readInitialState<HostToWebview>();
		if (initial !== undefined && isHostToWebview(initial)) {
			this.applyState(initial);
		}

		window.addEventListener('message', this.handleMessage);
		this.stopRefreshTriggers?.();
		this.stopRefreshTriggers = connectRefreshTriggers(() => this.host.postMessage({ kind: 'requestRefresh' }));
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		window.removeEventListener('message', this.handleMessage);
		this.stopRefreshTriggers?.();
		this.stopRefreshTriggers = undefined;
	}

	updated(): void {
		if (!this.diagnosticsEnabled) {
			return;
		}

		const agentSelected = this.claudeSelected || this.codexSelected;
		this.host.postMessage({
			kind: 'rendered',
			diagnostic: {
				cliAvailable: this.cliAvailable,
				claudeSelected: this.claudeSelected,
				codexSelected: this.codexSelected,
				initDisabled: !this.cliAvailable || !agentSelected,
			},
		});
	}

	render() {
		const agentSelected = this.claudeSelected || this.codexSelected;
		const initDisabled = !this.cliAvailable || !agentSelected;
		const initTooltip = !this.cliAvailable
			? 'Install the CodeSteward CLI first'
			: !agentSelected
				? 'Select Claude Code, Codex, or both'
				: '';
		return html`
			<h1>CodeSteward</h1>
			<p>Initialize this project to create the CodeSteward store and its Decision Record directories at the project root.</p>
			<div class="status">CLI: ${this.cliAvailable ? `${this.cliPath} available` : `${this.cliPath} not found`}</div>
			<cs-button variant="secondary" ?disabled=${this.cliAvailable} @click=${this.installCli}>
				${this.cliAvailable ? 'CodeSteward CLI Installed' : 'Install CodeSteward CLI'}
			</cs-button>
			<fieldset class="agents">
				<legend>Agent harnesses</legend>
				<label>
					<input
						type="checkbox"
						.checked=${this.claudeSelected}
						@change=${this.toggleClaude}
					/>
					Claude Code
				</label>
				<label>
					<input
						type="checkbox"
						.checked=${this.codexSelected}
						@change=${this.toggleCodex}
					/>
					Codex
				</label>
			</fieldset>
			<cs-button ?disabled=${initDisabled} title=${initTooltip} @click=${this.init}>
				Initialize Project
			</cs-button>
		`;
	}

	private handleMessage = (event: MessageEvent<unknown>): void => {
		if (!isHostToWebview(event.data)) {
			return;
		}

		this.applyState(event.data);
	};

	private applyState(message: HostToWebview): void {
		switch (message.kind) {
			case 'state':
				this.host.setState(message);
				this.cliAvailable = message.state.cliAvailable;
				this.cliPath = message.state.cliPath;
				this.diagnosticsEnabled = message.diagnosticsEnabled === true;
				return;
			case 'diagnosticToggleAgent':
				if (!this.diagnosticsEnabled) {
					return;
				}

				if (message.agent === 'claude') {
					this.claudeSelected = message.selected;
				} else {
					this.codexSelected = message.selected;
				}

				return;
			case 'diagnosticInit':
				if (!this.diagnosticsEnabled) {
					return;
				}

				this.init();
				return;
			default:
				assertNever(message);
		}
	}

	private installCli = (): void => {
		this.host.postMessage({ kind: 'installCli' });
	};

	private init = (): void => {
		if (!this.claudeSelected && !this.codexSelected) {
			return;
		}

		this.host.postMessage({ kind: 'init', claude: this.claudeSelected, codex: this.codexSelected });
	};

	private toggleClaude = (event: Event): void => {
		this.claudeSelected = (event.target as HTMLInputElement).checked;
	};

	private toggleCodex = (event: Event): void => {
		this.codexSelected = (event.target as HTMLInputElement).checked;
	};

	// keep a typed reference to WelcomeState to ensure the message contract type is exercised
	private static readonly _stateProbe: WelcomeState | undefined = undefined;
}
