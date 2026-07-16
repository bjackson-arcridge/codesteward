import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { messageComposerKeyAction } from '../../../messageComposerKeyboard.js';
import type { PromptContext } from '../../../promptCommand.js';
import { type HostToWebview, type WebviewToHost, isHostToWebview } from '../../messages/messages.js';
import { assertNever } from '../../shared/assertNever.js';
import { getHost, readInitialState } from '../shared/host.js';
import { tokenStyles } from '../shared/styles.js';

@customElement('se-messages-app')
export class MessagesApp extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: block;
				padding: 12px;
				background: var(--se-bg);
			}

			h1 {
				margin: 0 0 12px;
				font-size: 1.1rem;
				font-weight: 600;
			}

			.empty,
			.status {
				margin: 0;
				line-height: 1.45;
				color: var(--se-muted-fg);
			}

			.context {
				margin: 0 0 12px;
				padding: 10px;
				border: 1px solid var(--se-border);
				border-radius: 3px;
				background: var(--se-surface-bg);
			}

			.context h2 {
				margin: 0 0 8px;
				font-size: 1rem;
				font-weight: 600;
			}

			dl {
				display: grid;
				grid-template-columns: max-content minmax(0, 1fr);
				gap: 4px 10px;
				margin: 0;
			}

			dt {
				color: var(--se-muted-fg);
			}

			dd {
				min-width: 0;
				margin: 0;
				overflow-wrap: anywhere;
			}

			code {
				font-family: var(--vscode-editor-font-family);
				font-size: var(--vscode-editor-font-size);
			}

			form {
				display: grid;
				gap: 8px;
			}

			label {
				font-weight: 600;
			}

			textarea {
				box-sizing: border-box;
				width: 100%;
				min-height: 112px;
				resize: vertical;
				padding: 8px;
				border: 1px solid var(--se-input-border);
				border-radius: 3px;
				background: var(--se-input-bg);
				color: var(--se-input-fg);
				font-family: var(--vscode-font-family);
				font-size: var(--vscode-font-size);
				line-height: 1.4;
			}

			textarea:focus-visible,
			button:focus-visible {
				outline: 1px solid var(--se-focus);
				outline-offset: 2px;
			}

			.actions {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
			}

			button {
				min-height: 28px;
				padding: 4px 12px;
				border: 1px solid var(--se-button-bg);
				border-radius: 3px;
				background: var(--se-button-bg);
				color: var(--se-button-fg);
				font: inherit;
				cursor: pointer;
			}

			button:hover:not(:disabled) {
				background: var(--se-button-hover);
			}

			button.secondary {
				border-color: var(--se-secondary-button-bg);
				background: var(--se-secondary-button-bg);
				color: var(--se-secondary-button-fg);
			}

			button.secondary:hover:not(:disabled) {
				background: var(--se-secondary-button-hover);
			}

			button:disabled {
				opacity: var(--vscode-disabledOpacity);
				cursor: default;
			}
		`,
	];

	private readonly host = getHost<WebviewToHost, HostToWebview>();
	@state() private prompt: PromptContext | undefined;
	@state() private message = '';
	@state() private submitting = false;
	@state() private status = '';

	connectedCallback(): void {
		super.connectedCallback();
		const persisted = this.host.getState();
		const initial = persisted !== undefined && isHostToWebview(persisted)
			? persisted
			: readInitialState<HostToWebview>();
		if (initial !== undefined && isHostToWebview(initial)) {
			this.applyHostMessage(initial);
		}

		window.addEventListener('message', this.handleMessage);
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		window.removeEventListener('message', this.handleMessage);
	}

	firstUpdated(): void {
		if (this.prompt !== undefined && document.visibilityState !== 'hidden') {
			this.renderRoot.querySelector<HTMLTextAreaElement>('#message')?.focus();
		}
	}

	render() {
		if (this.prompt === undefined) {
			return html`
				<h1>Messages</h1>
				<p class="empty">Run Sundial Editor: Submit Prompt from a supported command line to begin a message.</p>
				${this.status === '' ? nothing : html`<p class="status" role="status">${this.status}</p>`}
			`;
		}

		return html`
			<h1>New message</h1>
			<section class="context" aria-label="Prompt context">
				<h2>Prompt context</h2>
				<dl>
					<dt>Preset</dt>
					<dd><code>${this.prompt.preset}</code></dd>
					<dt>Scope</dt>
					<dd>${this.prompt.scope === 'project' ? 'Project' : 'Current line'}</dd>
					<dt>Source</dt>
					<dd>Line ${this.prompt.sourceLine + 1}</dd>
				</dl>
			</section>
			<form @submit=${this.submit} @keydown=${this.handleKeydown}>
				<label for="message">Message</label>
				<textarea
					id="message"
					.value=${this.message}
					@input=${this.updateMessage}
					aria-describedby="message-help"
				></textarea>
				<div id="message-help" class="status">Press Enter to send, Shift+Enter for a new line, or Escape to cancel.</div>
				<div class="actions">
					<button type="submit" ?disabled=${this.submitting}>Send</button>
					<button class="secondary" type="button" ?disabled=${this.submitting} @click=${this.cancel}>Cancel</button>
				</div>
			</form>
		`;
	}

	private handleMessage = (event: MessageEvent<unknown>): void => {
		if (isHostToWebview(event.data)) {
			this.applyHostMessage(event.data);
		}
	};

	private applyHostMessage(message: HostToWebview): void {
		switch (message.kind) {
			case 'state':
				this.host.setState(message);
				const openingPrompt = this.prompt === undefined && message.prompt !== undefined;
				this.prompt = message.prompt;
				if (message.prompt === undefined) {
					this.message = '';
				} else {
					this.status = '';
					if (openingPrompt) {
						this.message = message.draft;
					}
				}
				return;
			case 'focusComposer':
				void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLTextAreaElement>('#message')?.focus());
				return;
			case 'clearPrompt':
				this.prompt = undefined;
				this.message = '';
				this.submitting = false;
				this.status = '';
				return;
			case 'submissionAcknowledged':
				this.prompt = undefined;
				this.message = '';
				this.submitting = false;
				this.status = 'Message acknowledged. Agent delivery is not part of this release.';
				return;
			default:
				return assertNever(message);
		}
	}

	private updateMessage = (event: Event): void => {
		this.message = (event.target as HTMLTextAreaElement).value;
	};

	private submit = (event: SubmitEvent): void => {
		event.preventDefault();
		this.submitMessage();
	};

	private submitMessage(): void {
		if (this.submitting || this.prompt === undefined) {
			return;
		}

		this.submitting = true;
		this.host.postMessage({ kind: 'submit', message: this.message });
	}

	private cancel = (): void => {
		if (!this.submitting && this.prompt !== undefined) {
			this.host.postMessage({ kind: 'cancel' });
		}
	};

	private handleKeydown = (event: KeyboardEvent): void => {
		const action = messageComposerKeyAction(event);
		if (action === 'cancel') {
			event.preventDefault();
			this.cancel();
			return;
		}

		if (event.target instanceof HTMLTextAreaElement && action === 'submit') {
			event.preventDefault();
			this.submitMessage();
		}
	};
}
