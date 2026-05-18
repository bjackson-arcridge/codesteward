import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tokenStyles } from '../shared/styles.js';
import { connectRefreshTriggers, getHost, readInitialState } from '../shared/host.js';
import { assertNever } from '../shared/guards.js';
import {
	type HostToWebview,
	type RecordActionMode,
	type RecordSummary,
	type WebviewToHost,
	isHostToWebview,
} from '../../records/messages.js';
import '../shared/components/cs-card.js';
import '../shared/components/cs-icon-button.js';
import '../shared/components/cs-badge.js';
import '../shared/components/cs-icon.js';

@customElement('cs-records-app')
export class RecordsApp extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: block;
				padding: 8px;
				background: var(--cs-bg);
			}

			.empty {
				padding: 16px 8px;
				color: var(--cs-fg-muted);
				line-height: 1.4;
			}

			.filters {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: 6px;
				padding: 0 4px 8px;
			}

			.filter-field {
				display: flex;
				min-width: 0;
				flex-direction: column;
				gap: 3px;
				color: var(--cs-fg-muted);
				font-size: calc(var(--vscode-font-size) - 1px);
			}

			select {
				width: 100%;
				min-width: 0;
				height: 26px;
				border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, var(--cs-card-border)));
				border-radius: 2px;
				background: var(--vscode-dropdown-background);
				color: var(--vscode-dropdown-foreground);
				font: inherit;
			}

			select:focus {
				outline: 1px solid var(--cs-focus);
				outline-offset: -1px;
			}

			.id {
				font-family: var(--vscode-editor-font-family);
			}

			@media (min-width: 260px) {
				.filters {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
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
	@state() private records: readonly RecordSummary[] = [];
	@state() private domainFilter?: string;
	@state() private domainOptions: readonly string[] = [];
	@state() private filtersEnabled = false;
	@state() private actionMode: RecordActionMode = 'accepted';
	@state() private emptyText = 'No accepted decision records yet.';
	@state() private diagnosticsEnabled = false;
	@state() private retirePromptRecordId?: string;

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

		this.send({
			kind: 'rendered',
			diagnostic: {
				recordCount: this.records.length,
				cardCount: this.renderRoot.querySelectorAll('cs-card').length,
				emptyVisible: this.renderRoot.querySelector('.empty') !== null,
				...(this.domainFilter === undefined ? {} : { domainFilter: this.domainFilter }),
				...(this.filtersEnabled ? {
					domainSelectOptionCount: this.renderRoot.querySelector<HTMLSelectElement>('select[data-filter="domain"]')?.options.length ?? 0,
				} : {}),
			},
		});
	}

	render() {
		return html`
			${this.filtersEnabled ? this.renderFilters() : nothing}
			${this.records.length === 0
				? html`<div class="empty">${this.emptyText}</div>`
				: this.records.map(record => this.renderRecord(record))}
		`;
	}

	private renderFilters() {
		return html`
			<div class="filters" aria-label="Decision record filters">
				<label class="filter-field">
					<span>Domain</span>
					<select
						data-filter="domain"
						.value=${this.domainFilter ?? ''}
						@change=${this.handleDomainFilterChange}
					>
						<option value="">All domains</option>
						${this.domainOptions.map(domain => html`<option value=${domain}>${domain}</option>`)}
					</select>
				</label>
			</div>
		`;
	}

	private renderRecord(record: RecordSummary) {
		const retirePromptOpen = this.actionMode === 'accepted' && this.retirePromptRecordId === record.id;
		return html`
			<cs-card>
				<button
					slot="title"
					class="title-button"
					type="button"
					title=${record.title}
					@click=${() => this.send({ kind: 'preview', id: record.id })}
				>${record.title}</button>
				<span slot="meta">
					<span class="id">${record.id}</span>
					<cs-badge variant="inverse">${record.domain}</cs-badge>
					${record.enabled ? nothing : html`<cs-badge>disabled</cs-badge>`}
					${record.workspace === undefined ? nothing : html`<span>${record.workspace}</span>`}
				</span>
				<div slot="actions">${this.renderActions(record)}</div>
				${retirePromptOpen ? this.renderRetirePrompt(record) : nothing}
			</cs-card>
		`;
	}

	private renderActions(record: RecordSummary) {
		const baseActions = html`
			<cs-icon-button
				icon="open-preview"
				label="View rendered markdown"
				@click=${() => this.send({ kind: 'preview', id: record.id })}
			></cs-icon-button>
			<cs-icon-button
				icon="edit"
				label="Edit markdown source"
				@click=${() => this.send({ kind: 'edit', id: record.id })}
			></cs-icon-button>
		`;

		if (this.actionMode === 'rejected') {
			return html`
				${baseActions}
				<cs-icon-button
					icon="check"
					label="Accept rejected candidate"
					@click=${() => this.send({ kind: 'promote', id: record.id })}
				></cs-icon-button>
				<cs-icon-button
					icon="trash"
					label="Delete rejected DR file"
					@click=${() => this.send({ kind: 'delete', id: record.id })}
				></cs-icon-button>
			`;
		}

		if (this.actionMode === 'retired') {
			return html`
				${baseActions}
				<cs-icon-button
					icon="arrow-up"
					label="Promote to accepted DR"
					@click=${() => this.send({ kind: 'promote', id: record.id })}
				></cs-icon-button>
				<cs-icon-button
					icon="trash"
					label="Delete retired DR file"
					@click=${() => this.send({ kind: 'delete', id: record.id })}
				></cs-icon-button>
			`;
		}

		return html`
			${baseActions}
			<cs-icon-button
				icon=${record.enabled ? 'eye' : 'eye-closed'}
				label=${record.enabled ? 'Disable retrieval' : 'Enable retrieval'}
				@click=${() => this.send({ kind: 'toggleEnabled', id: record.id, enabled: !record.enabled })}
			></cs-icon-button>
			<cs-icon-button
				icon="archive"
				label="Retire DR"
				.expanded=${this.retirePromptRecordId === record.id}
				@click=${(event: Event) => this.openRetirePrompt(record, event)}
			></cs-icon-button>
		`;
	}

	private renderRetirePrompt(record: RecordSummary) {
		return html`
			<form
				slot="body"
				class="inline-prompt"
				data-action-prompt="retire"
				aria-label="Retire decision record"
				@submit=${(event: SubmitEvent) => this.submitRetirePrompt(event, record)}
				@keydown=${this.handlePromptKeydown}
			>
				<input
					name="value"
					type="text"
					aria-label="Successor decision record or candidate id"
					placeholder="Successor id (optional)"
					autocomplete="off"
				/>
				<button class="prompt-button" type="submit" aria-label="Retire DR">
					<cs-icon icon="check"></cs-icon>
				</button>
				<button
					class="prompt-button"
					type="button"
					aria-label="Cancel"
					@click=${() => this.closeRetirePrompt()}
				>
					<cs-icon icon="close"></cs-icon>
				</button>
			</form>
		`;
	}

	private openRetirePrompt(record: RecordSummary, event: Event): void {
		if (this.retirePromptRecordId === record.id) {
			this.closeRetirePrompt();
			return;
		}

		this.promptReturnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
		this.retirePromptRecordId = record.id;
		void this.focusPromptInput();
	}

	private submitRetirePrompt(event: SubmitEvent, record: RecordSummary): void {
		event.preventDefault();
		const retiredBy = this.promptValue(event.currentTarget);

		this.send({ kind: 'retire', id: record.id, retiredBy });
		this.closeRetirePrompt(false);
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
			this.closeRetirePrompt();
		}
	};

	private async focusPromptInput(): Promise<void> {
		await this.updateComplete;
		this.renderRoot.querySelector<HTMLInputElement>('.inline-prompt input')?.focus();
	}

	private closeRetirePrompt(restoreFocus = true): void {
		const target = this.promptReturnTarget;
		this.retirePromptRecordId = undefined;
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
				this.records = message.records;
				this.domainFilter = message.domainFilter;
				this.domainOptions = message.domainOptions ?? [];
				this.filtersEnabled = message.domainOptions !== undefined;
				this.actionMode = message.actionMode ?? 'accepted';
				this.emptyText = message.emptyText ?? 'No accepted decision records yet.';
				this.diagnosticsEnabled = message.diagnosticsEnabled === true;
				if (
					this.retirePromptRecordId !== undefined
					&& (this.actionMode !== 'accepted' || !message.records.some(record => record.id === this.retirePromptRecordId))
				) {
					this.retirePromptRecordId = undefined;
					this.promptReturnTarget = undefined;
				}
				return;
			case 'diagnosticSelectFilter':
				if (this.diagnosticsEnabled) {
					this.selectFilterForDiagnostics(message.filter, message.value);
				}
				return;
			default:
				assertNever(message);
		}
	}

	private handleDomainFilterChange = (event: Event): void => {
		this.send({
			kind: 'setDomainFilter',
			...filterValue((event.currentTarget as HTMLSelectElement).value, 'domainFilter'),
		});
	};

	private selectFilterForDiagnostics(filter: 'domain', value: string | undefined): void {
		const select = this.renderRoot.querySelector<HTMLSelectElement>(`select[data-filter="${filter}"]`);
		if (select === null) {
			return;
		}

		select.value = value ?? '';
		select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
	}

	private focusElement(element: HTMLElement): void {
		const shadowButton = element.shadowRoot?.querySelector<HTMLButtonElement>('button');
		(shadowButton ?? element).focus();
	}

	private send(message: WebviewToHost): void {
		this.host.postMessage(message);
	}
}

function filterValue<Key extends 'domainFilter'>(
	value: string,
	key: Key,
): Partial<Record<Key, string>> {
	return value.length === 0 ? {} : { [key]: value } as Partial<Record<Key, string>>;
}
