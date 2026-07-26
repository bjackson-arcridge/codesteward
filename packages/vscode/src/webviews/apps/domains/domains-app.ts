import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tokenStyles } from '../shared/styles.js';
import { connectRefreshTriggers } from '../shared/host.js';
import {
	type DomainSummary,
	type DomainSuggestion,
	type DomainWorkspace,
	type HostToWebview,
	type WebviewToHost,
	isHostToWebview,
} from '../../domains/messages.js';
import '../shared/components/cs-icon-button.js';

type FormMode = { readonly kind: 'add' } | { readonly kind: 'edit'; readonly currentName: string };

@customElement('cs-domains-app')
export class DomainsApp extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: block;
				padding: 8px;
				background: var(--cs-bg);
			}

			.toolbar, .row-heading, .form-actions {
				display: flex;
				align-items: center;
				gap: 6px;
			}

			.toolbar {
				justify-content: space-between;
				margin-bottom: 8px;
			}

			select, input, textarea {
				width: 100%;
				box-sizing: border-box;
				padding: 4px 6px;
				border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, var(--cs-card-border)));
				border-radius: 2px;
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font: inherit;
			}

			textarea {
				min-height: 54px;
				resize: vertical;
			}

			select:focus, input:focus, textarea:focus, button:focus-visible {
				outline: 1px solid var(--cs-focus);
				outline-offset: 1px;
			}

			.add-button, .primary, .secondary, .suggestion, .confirm {
				border: 0;
				border-radius: 2px;
				font: inherit;
				cursor: pointer;
			}

			.add-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				background: transparent;
				color: var(--cs-icon-fg);
				font-size: 18px;
			}

			.add-button:hover { background: var(--cs-icon-hover-bg); }
			.primary, .confirm {
				padding: 4px 9px;
				background: var(--cs-button-bg);
				color: var(--cs-button-fg);
			}
			.primary:hover, .confirm:hover { background: var(--cs-button-hover); }
			.secondary, .suggestion {
				padding: 4px 9px;
				background: var(--cs-button-secondary-bg);
				color: var(--cs-button-secondary-fg);
			}
			.secondary:hover, .suggestion:hover { background: var(--cs-button-secondary-hover); }

			.form {
				display: grid;
				gap: 7px;
				margin-bottom: 8px;
				padding: 8px;
				border: 1px solid var(--cs-card-border);
				border-radius: 3px;
				background: var(--cs-card-bg);
			}

			label {
				display: grid;
				gap: 3px;
				color: var(--cs-fg-muted);
			}

			.hint, .usage, .empty {
				color: var(--cs-fg-muted);
				font-size: calc(var(--vscode-font-size) - 1px);
			}

			.error {
				margin: 6px 0;
				color: var(--vscode-errorForeground);
				overflow-wrap: anywhere;
			}

			.suggestions {
				display: grid;
				gap: 4px;
			}

			.suggestion {
				text-align: left;
			}

			.suggestion strong { display: block; }
			.suggestion span { color: var(--cs-fg-muted); }

			ul {
				display: grid;
				gap: 6px;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			li {
				padding: 7px;
				border: 1px solid var(--cs-card-border);
				border-radius: 3px;
				background: var(--cs-card-bg);
			}

			.row-heading { justify-content: space-between; }
			.name {
				font-family: var(--vscode-editor-font-family);
				font-weight: 600;
			}
			.description {
				margin-top: 4px;
				line-height: 1.35;
				overflow-wrap: anywhere;
			}
			.confirm-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 6px;
				margin-top: 6px;
			}
		`,
	];

	@state() private workspaces: readonly DomainWorkspace[] = [];
	@state() private selectedWorkspace?: string;
	@state() private domains: readonly DomainSummary[] = [];
	@state() private suggestions: readonly DomainSuggestion[] = [];
	@state() private busy = false;
	@state() private error?: string;
	@state() private diagnosticsEnabled = false;
	@state() private form?: FormMode;
	@state() private formName = '';
	@state() private formDescription = '';
	@state() private removeName?: string;
	private returnTarget?: HTMLElement;
	private stopRefreshTriggers?: () => void;

	connectedCallback(): void {
		super.connectedCallback();
		this.stopRefreshTriggers = connectRefreshTriggers(() => this.send({ kind: 'requestRefresh' }));
	}

	disconnectedCallback(): void {
		this.stopRefreshTriggers?.();
		super.disconnectedCallback();
	}

	updated(): void {
		if (this.diagnosticsEnabled) {
			this.send({
				kind: 'rendered',
				diagnostic: {
					...(this.selectedWorkspace === undefined ? {} : { selectedWorkspace: this.selectedWorkspace }),
					domainCount: this.domains.length,
					suggestionCount: this.suggestions.length,
					formVisible: this.form !== undefined,
				},
			});
		}
	}

	render() {
		return html`
			<div class="toolbar">
				${this.workspaces.length > 1 ? html`
					<label>
						Workspace
						<select
							.value=${this.selectedWorkspace ?? ''}
							?disabled=${this.busy}
							@change=${this.changeWorkspace}
						>
							${this.workspaces.map(workspace => html`
								<option value=${workspace.root}>${workspace.name}</option>
							`)}
						</select>
					</label>
				` : html`<span class="hint">Project domain vocabulary</span>`}
				<button
					class="add-button"
					type="button"
					aria-label="Add domain"
					aria-expanded=${this.form?.kind === 'add'}
					aria-controls="domain-form"
					?disabled=${this.busy}
					@click=${(event: Event) => this.openAdd(event)}
				>+</button>
			</div>
			${this.error === undefined ? nothing : html`<div class="error" role="alert">${this.error}</div>`}
			${this.form === undefined ? nothing : this.renderForm()}
			${this.domains.length === 0
				? html`<div class="empty">No domains defined.</div>`
				: html`<ul aria-label="Domains">${this.domains.map(domain => this.renderDomain(domain))}</ul>`}
		`;
	}

	private renderForm() {
		const editing = this.form?.kind === 'edit';
		const currentName = this.form?.kind === 'edit' ? this.form.currentName : undefined;
		const current = currentName === undefined ? undefined : this.domains.find(domain => domain.name === currentName);
		const lockName = current?.name === 'all' || (current?.referenceCount ?? 0) > 0;
		return html`
			<form id="domain-form" class="form" aria-label=${editing ? `Edit ${current?.name ?? 'domain'}` : 'Add domain'}
				@submit=${this.submitForm} @keydown=${this.formKeydown}>
				<label>
					Name
					<input name="name" required autocomplete="off" .value=${this.formName}
						?disabled=${this.busy || lockName}
						@input=${(event: InputEvent) => this.formName = (event.target as HTMLInputElement).value} />
				</label>
				<div class="hint">Use lowercase kebab-case; nested names such as ui.accessibility are supported.</div>
				<label>
					Description
					<textarea name="description" required .value=${this.formDescription} ?disabled=${this.busy}
						@input=${(event: InputEvent) => this.formDescription = (event.target as HTMLTextAreaElement).value}></textarea>
				</label>
				<div class="form-actions">
					<button class="primary" type="submit" ?disabled=${this.busy}>Save</button>
					<button class="secondary" type="button" ?disabled=${this.busy} @click=${() => this.closeForm()}>Cancel</button>
				</div>
				${editing || this.suggestions.length === 0 ? nothing : html`
					<div class="suggestions" aria-label="Suggested domains">
						<div class="hint">Common Domains (click to add)</div>
						${this.suggestions.map(suggestion => html`
							<button class="suggestion" type="button" @click=${() => this.chooseSuggestion(suggestion)}>
								<strong>${suggestion.name}</strong><span>${suggestion.description}</span>
							</button>
						`)}
					</div>
				`}
			</form>
		`;
	}

	private renderDomain(domain: DomainSummary) {
		const protectedDomain = domain.name === 'all';
		const referenced = domain.referenceCount > 0;
		return html`
			<li>
				<div class="row-heading">
					<span class="name">${domain.name}</span>
					<span>
						<cs-icon-button icon="edit" label="Edit ${domain.name}" ?disabled=${this.busy}
							@click=${(event: Event) => this.openEdit(domain, event)}></cs-icon-button>
						<cs-icon-button icon="trash" label="Remove ${domain.name}"
							?disabled=${this.busy || protectedDomain || referenced}
							.expanded=${this.removeName === domain.name}
							@click=${() => this.removeName = this.removeName === domain.name ? undefined : domain.name}></cs-icon-button>
					</span>
				</div>
				<div class="description">${domain.description}</div>
				<div class="usage">${domain.referenceCount === 0 ? 'Not referenced' : `${domain.referenceCount} exact reference${domain.referenceCount === 1 ? '' : 's'}`}</div>
				${this.removeName === domain.name ? html`
					<div class="confirm-row" role="alert">
						<span>Remove this domain?</span>
						<span>
							<button class="confirm" type="button" @click=${() => this.confirmRemove(domain.name)}>Remove</button>
							<button class="secondary" type="button" @click=${() => this.removeName = undefined}>Cancel</button>
						</span>
					</div>
				` : nothing}
			</li>
		`;
	}

	private readonly changeWorkspace = (event: Event): void => {
		const target = event.target;
		if (target instanceof HTMLSelectElement) {
			this.send({ kind: 'selectWorkspace', root: target.value });
		}
	};

	private openAdd(event: Event): void {
		this.returnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
		this.form = { kind: 'add' };
		this.formName = '';
		this.formDescription = '';
		this.removeName = undefined;
		void this.focusForm();
	}

	private openEdit(domain: DomainSummary, event: Event): void {
		this.returnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
		this.form = { kind: 'edit', currentName: domain.name };
		this.formName = domain.name;
		this.formDescription = domain.description;
		this.removeName = undefined;
		void this.focusForm();
	}

	private chooseSuggestion(suggestion: DomainSuggestion): void {
		this.formName = suggestion.name;
		this.formDescription = suggestion.description;
	}

	private readonly submitForm = (event: SubmitEvent): void => {
		event.preventDefault();
		const name = this.formName.trim();
		const description = this.formDescription.trim();
		if (this.form?.kind === 'edit') {
			this.send({ kind: 'update', currentName: this.form.currentName, name, description });
		} else {
			this.send({ kind: 'add', name, description });
		}
	};

	private readonly formKeydown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			event.preventDefault();
			this.closeForm();
		}
	};

	private closeForm(): void {
		const target = this.returnTarget;
		this.form = undefined;
		this.returnTarget = undefined;
		if (target !== undefined) {
			void this.updateComplete.then(() => {
				(target.shadowRoot?.querySelector<HTMLElement>('button') ?? target).focus();
			});
		}
	}

	private confirmRemove(name: string): void {
		this.removeName = undefined;
		this.send({ kind: 'remove', name });
	}

	private async focusForm(): Promise<void> {
		await this.updateComplete;
		this.renderRoot.querySelector<HTMLInputElement>('#domain-form input:not(:disabled), #domain-form textarea')?.focus();
	}

	acceptHostMessage(message: unknown): void {
		if (!isHostToWebview(message)) {
			return;
		}
		const mutationFinished = this.busy && !message.busy;
		this.workspaces = message.workspaces;
		this.selectedWorkspace = message.selectedWorkspace;
		this.domains = message.domains;
		this.suggestions = message.suggestions;
		this.busy = message.busy;
		this.error = message.error;
		this.diagnosticsEnabled = message.diagnosticsEnabled === true;
		if (mutationFinished && message.error === undefined) {
			this.closeForm();
			this.removeName = undefined;
		}
	}

	private send(message: WebviewToHost): void {
		this.dispatchEvent(new CustomEvent<WebviewToHost>('cs-section-message', {
			detail: message,
			bubbles: true,
			composed: true,
		}));
	}
}
