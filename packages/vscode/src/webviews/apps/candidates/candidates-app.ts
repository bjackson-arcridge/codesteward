import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tokenStyles } from '../shared/styles.js';
import { connectRefreshTriggers, getHost, readInitialState } from '../shared/host.js';
import { assertNever } from '../shared/guards.js';
import {
	type BootstrapProvider,
	type CandidateSummary,
	type SimpleCandidateCommandKind,
	type HostToWebview,
	type WebviewToHost,
	isHostToWebview,
} from '../../candidates/messages.js';
import '../shared/components/cs-card.js';
import '../shared/components/cs-icon-button.js';
import '../shared/components/cs-badge.js';
import '../shared/components/cs-button.js';
import '../shared/components/cs-icon.js';

type CandidatePromptKind = 'reject';

interface CandidatePrompt {
	readonly candidateId: string;
	readonly kind: CandidatePromptKind;
}

@customElement('cs-candidates-app')
export class CandidatesApp extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: block;
				padding: 8px;
				background: var(--cs-bg);
			}

			.empty {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto;
				align-items: center;
				gap: 6px 8px;
				padding: 8px 4px 10px;
				color: var(--cs-fg-muted);
				line-height: 1.4;
			}

			.empty-message {
				min-width: 0;
				overflow-wrap: anywhere;
			}

			.empty-action {
				justify-self: end;
			}

			.provider-selector {
				grid-column: 1 / -1;
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 4px 10px;
				margin: 0;
				padding: 5px 8px;
				border: 1px solid var(--cs-card-border);
				border-radius: 2px;
				background: var(--cs-card-bg);
			}

			.provider-selector legend {
				padding: 0 4px;
				font-size: calc(var(--vscode-font-size) - 1px);
				color: var(--cs-fg-muted);
			}

			.provider-selector label {
				display: flex;
				align-items: center;
				gap: 6px;
				cursor: pointer;
				color: var(--cs-fg);
			}

			.provider-selector input[type='radio'] {
				accent-color: var(--cs-button-bg);
				cursor: pointer;
			}

			@media (max-width: 240px) {
				.empty {
					grid-template-columns: minmax(0, 1fr);
				}

				.empty-action {
					justify-self: start;
				}
			}

			.id {
				font-family: var(--vscode-editor-font-family);
			}

			.title-button {
				display: inline;
				padding: 0;
				border: 0;
				background: transparent;
				color: inherit;
				font: inherit;
				font-weight: 600;
				line-height: 1.35;
				text-align: left;
				cursor: pointer;
				overflow-wrap: anywhere;
			}

			.title-button:hover {
				text-decoration: underline;
			}

			.inline-prompt {
				display: grid;
				grid-template-columns: minmax(0, 1fr) 24px 24px;
				gap: 4px;
				align-items: center;
				animation: prompt-slide-in 140ms ease-out;
				transform-origin: top right;
			}

			.inline-prompt input {
				min-width: 0;
				height: 26px;
				box-sizing: border-box;
				padding: 3px 6px;
				border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, var(--cs-card-border)));
				border-radius: 2px;
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font: inherit;
			}

			.inline-prompt input:focus {
				outline: 1px solid var(--cs-focus);
				outline-offset: -1px;
			}

			.prompt-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				padding: 0;
				border: 0;
				border-radius: 4px;
				background: transparent;
				color: var(--cs-icon-fg);
				cursor: pointer;
			}

			.prompt-button:hover {
				background: var(--cs-icon-hover-bg);
			}

			@keyframes prompt-slide-in {
				from {
					opacity: 0;
					transform: translateY(-4px);
				}

				to {
					opacity: 1;
					transform: translateY(0);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.inline-prompt {
					animation: none;
				}
			}
		`,
	];

	private readonly host = getHost<WebviewToHost, HostToWebview>();
	private stopRefreshTriggers?: () => void;
	private promptReturnTarget?: HTMLElement;
	@state() private candidates: readonly CandidateSummary[] = [];
	@state() private installedProviders: readonly BootstrapProvider[] = [];
	@state() private hasAcceptedRecords = false;
	@state() private selectedProvider?: BootstrapProvider;
	@state() private diagnosticsEnabled = false;
	@state() private activePrompt?: CandidatePrompt;

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
		this.stopRefreshTriggers = connectRefreshTriggers(() => this.send({ kind: 'requestRefresh' }));
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

		const provider = this.effectiveProvider();
		this.send({
			kind: 'rendered',
			diagnostic: {
				candidateCount: this.candidates.length,
				cardCount: this.renderRoot.querySelectorAll('cs-card').length,
				emptyVisible: this.renderRoot.querySelector('.empty') !== null,
				bootstrapAction: this.bootstrapAction(),
				...(provider === undefined ? {} : { bootstrapProvider: provider }),
				providerSelectorVisible: this.installedProviders.length >= 2,
			},
		});
	}

	render() {
		if (this.candidates.length === 0) {
			return this.renderEmpty();
		}

		return html`${this.candidates.map(candidate => this.renderCandidate(candidate))}`;
	}

	private renderEmpty() {
		const action = this.bootstrapAction();
		const label = action === 'audit' ? 'Audit decisions' : 'Bootstrap decisions';
		const emptyMessage = 'No active candidates.';
		const providerSelector = this.installedProviders.length >= 2 ? this.renderProviderSelector() : nothing;
		const buttonDisabled = this.installedProviders.length === 0;
		const buttonTooltip = buttonDisabled
			? 'Initialize a Claude Code or Codex harness before running bootstrap.'
			: '';
		return html`
			<div class="empty">
				<div class="empty-message">${emptyMessage}</div>
				<cs-button
					class="empty-action"
					?disabled=${buttonDisabled}
					title=${buttonTooltip}
					@click=${this.dispatchBootstrap}
				>${label}</cs-button>
				${providerSelector}
			</div>
		`;
	}

	private renderProviderSelector() {
		const provider = this.effectiveProvider();
		return html`
			<fieldset class="provider-selector" role="radiogroup" aria-label="Bootstrap provider">
				<legend>Run with</legend>
				${this.installedProviders.map(option => html`
					<label>
						<input
							type="radio"
							name="bootstrap-provider"
							value=${option}
							.checked=${provider === option}
							@change=${() => this.selectProvider(option)}
						/>
						${option === 'claude' ? 'Claude Code' : 'Codex'}
					</label>
				`)}
			</fieldset>
		`;
	}

	private bootstrapAction(): 'bootstrap' | 'audit' {
		return this.hasAcceptedRecords ? 'audit' : 'bootstrap';
	}

	private effectiveProvider(): BootstrapProvider | undefined {
		if (this.installedProviders.length === 0) {
			return undefined;
		}

		if (this.selectedProvider !== undefined && this.installedProviders.includes(this.selectedProvider)) {
			return this.selectedProvider;
		}

		return this.installedProviders[0];
	}

	private selectProvider(provider: BootstrapProvider): void {
		this.selectedProvider = provider;
	}

	private dispatchBootstrap = (): void => {
		const provider = this.effectiveProvider();
		if (provider === undefined) {
			return;
		}

		this.send({ kind: 'bootstrap', provider });
	};

	private renderCandidate(candidate: CandidateSummary) {
		const activePrompt = this.activePrompt?.candidateId === candidate.id ? this.activePrompt : undefined;
		return html`
			<cs-card>
				<button
					slot="title"
					class="title-button"
					type="button"
					title=${candidate.title}
					data-candidate-id=${candidate.id}
					data-candidate-target="title"
					@click=${() => this.sendCandidateCommand('preview', candidate)}
				>${candidate.title}</button>
				<span slot="meta">
					<span class="id">${candidate.id}</span>
					${candidate.workspace === undefined ? nothing : html`<span>${candidate.workspace}</span>`}
				</span>
				<div slot="actions">
					<cs-icon-button
						icon="edit"
						label="Edit markdown source"
						@click=${() => this.sendCandidateCommand('edit', candidate)}
					></cs-icon-button>
					<cs-icon-button
						icon="check"
						label="Accept candidate"
						@click=${() => this.sendCandidateCommand('accept', candidate)}
					></cs-icon-button>
					<cs-icon-button
						icon="close"
						label="Reject candidate"
						.expanded=${activePrompt?.kind === 'reject'}
						@click=${(event: Event) => this.openPrompt('reject', candidate, event)}
					></cs-icon-button>
					<cs-icon-button
						icon="trash"
						label="Dismiss candidate"
						@click=${() => this.sendCandidateCommand('dismiss', candidate)}
					></cs-icon-button>
				</div>
				${activePrompt === undefined ? nothing : this.renderPrompt(candidate, activePrompt)}
			</cs-card>
		`;
	}

	private renderPrompt(candidate: CandidateSummary, prompt: CandidatePrompt) {
		const reject = prompt.kind === 'reject';
		return html`
			<form
				slot="body"
				class="inline-prompt"
				data-action-prompt=${prompt.kind}
				aria-label=${reject ? 'Reject candidate' : 'Retire candidate'}
				@submit=${(event: SubmitEvent) => this.submitPrompt(event, candidate, prompt)}
				@keydown=${this.handlePromptKeydown}
			>
				<input
					name="value"
					type="text"
					aria-label=${reject ? 'Reject reason' : 'Successor decision record or candidate id'}
					placeholder=${reject ? 'Reason (optional)' : 'Successor id (optional)'}
					autocomplete="off"
				/>
				<button
					class="prompt-button"
					type="submit"
					aria-label=${reject ? 'Reject candidate' : 'Retire candidate'}
				>
					<cs-icon icon="check"></cs-icon>
				</button>
				<button
					class="prompt-button"
					type="button"
					aria-label="Cancel"
					@click=${() => this.closePrompt()}
				>
					<cs-icon icon="close"></cs-icon>
				</button>
			</form>
		`;
	}

	private sendCandidateCommand(kind: Exclude<SimpleCandidateCommandKind, 'open'>, candidate: CandidateSummary): void {
		this.send({
			kind,
			id: candidate.id,
			...(candidate.filePath === undefined ? {} : { filePath: candidate.filePath }),
		});
	}

	private openPrompt(kind: CandidatePromptKind, candidate: CandidateSummary, event: Event): void {
		if (this.activePrompt?.candidateId === candidate.id && this.activePrompt.kind === kind) {
			this.closePrompt();
			return;
		}

		this.promptReturnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
		this.activePrompt = { candidateId: candidate.id, kind };
		void this.focusPromptInput();
	}

	private submitPrompt(event: SubmitEvent, candidate: CandidateSummary, prompt: CandidatePrompt): void {
		event.preventDefault();
		const value = this.promptValue(event.currentTarget);

		this.send({
			kind: 'reject',
			id: candidate.id,
			...(candidate.filePath === undefined ? {} : { filePath: candidate.filePath }),
			reason: value,
		});

		this.closePrompt(false);
	}

	private promptValue(target: EventTarget | null): string {
		if (!(target instanceof HTMLFormElement)) {
			return '';
		}

		const value = new FormData(target).get('value');
		return typeof value === 'string' ? value.trim() : '';
	}

	private readonly handlePromptKeydown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			this.closePrompt();
		}
	};

	private async focusPromptInput(): Promise<void> {
		await this.updateComplete;
		this.renderRoot.querySelector<HTMLInputElement>('.inline-prompt input')?.focus();
	}

	private closePrompt(restoreFocus = true): void {
		const target = this.promptReturnTarget;
		this.activePrompt = undefined;
		this.promptReturnTarget = undefined;
		if (restoreFocus && target !== undefined) {
			void this.updateComplete.then(() => this.focusElement(target));
		}
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
				this.candidates = message.candidates;
				this.installedProviders = message.installedProviders;
				this.hasAcceptedRecords = message.hasAcceptedRecords;
				this.diagnosticsEnabled = message.diagnosticsEnabled === true;
				if (this.selectedProvider !== undefined && !message.installedProviders.includes(this.selectedProvider)) {
					this.selectedProvider = undefined;
				}

				if (this.activePrompt !== undefined && !message.candidates.some(candidate => candidate.id === this.activePrompt?.candidateId)) {
					this.activePrompt = undefined;
					this.promptReturnTarget = undefined;
				}
				return;
			case 'diagnosticClickCandidate':
				if (this.diagnosticsEnabled) {
					this.clickCandidate(message.id, message.target);
				}
				return;
			case 'diagnosticSelectProvider':
				if (this.diagnosticsEnabled) {
					this.selectProvider(message.provider);
				}
				return;
			default:
				assertNever(message);
		}
	}

	private clickCandidate(id: string, target: 'title'): void {
		for (const element of this.renderRoot.querySelectorAll<HTMLElement>('[data-candidate-id]')) {
			if (element.dataset.candidateId === id && element.dataset.candidateTarget === target) {
				this.clickElement(element);
				return;
			}
		}
	}

	private clickElement(element: HTMLElement): void {
		const shadowButton = element.shadowRoot?.querySelector<HTMLButtonElement>('button');
		(shadowButton ?? element).click();
	}

	private focusElement(element: HTMLElement): void {
		const shadowButton = element.shadowRoot?.querySelector<HTMLButtonElement>('button');
		(shadowButton ?? element).focus();
	}

	private send(message: WebviewToHost): void {
		this.host.postMessage(message);
	}
}
