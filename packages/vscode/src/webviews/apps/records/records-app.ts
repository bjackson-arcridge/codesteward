import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { tokenStyles } from '../shared/styles.js';
import { connectRefreshTriggers, getHost, readInitialState } from '../shared/host.js';
import { assertNever } from '../shared/guards.js';
import {
	type HostToWebview,
	type RecordClickTarget,
	type RecordActionMode,
	type RecordSummary,
	type SpecRecordGroup,
	type WebviewToHost,
	isHostToWebview,
} from '../../records/messages.js';
import { type SpecSessionPhase } from '../../../specSessions.js';
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

			input {
				width: 100%;
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

			input:focus {
				outline: 1px solid var(--cs-focus);
				outline-offset: -1px;
			}

			.id {
				font-family: var(--vscode-editor-font-family);
			}

			.summary {
				margin: 0;
				color: var(--cs-fg);
				line-height: 1.4;
				overflow-wrap: anywhere;
			}

			.specs-launcher {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 6px;
				width: 100%;
				min-height: 32px;
				box-sizing: border-box;
				margin: 0 0 8px;
				padding: 6px 8px;
				border: 1px solid var(--vscode-button-border, transparent);
				border-radius: 4px;
				background: var(--cs-button-bg);
				color: var(--cs-button-fg);
				font: inherit;
				font-weight: 600;
				cursor: pointer;
			}

			.spec-add-form {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto;
				gap: 4px;
				align-items: center;
				margin: 0 0 8px;
				padding: 0 0 8px;
				border-bottom: 1px solid var(--cs-card-border);
			}

			.spec-add-form[data-has-workspaces='true'] {
				grid-template-columns: minmax(0, 1fr) minmax(72px, 108px) auto;
			}

			.spec-add-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 6px;
				min-height: 26px;
				box-sizing: border-box;
				padding: 3px 8px;
				border: 1px solid var(--vscode-button-border, transparent);
				border-radius: 2px;
				background: var(--cs-button-bg);
				color: var(--cs-button-fg);
				font: inherit;
				cursor: pointer;
			}

			.spec-add-button:hover {
				background: var(--cs-button-hover);
			}

			.spec-add-button:focus-visible {
				outline: 1px solid var(--cs-focus);
				outline-offset: 2px;
			}

			.specs-launcher:hover {
				background: var(--cs-button-hover);
			}

			.specs-launcher:focus-visible,
			.group-toggle:focus-visible {
				outline: 1px solid var(--cs-focus);
				outline-offset: 2px;
			}

			.spec-group {
				margin: 0 0 8px;
			}

			.spec-group[data-drop-target='true'] .group-toggle {
				outline: 1px solid var(--cs-focus);
				outline-offset: 1px;
			}

			.group-toggle {
				display: grid;
				grid-template-columns: 16px minmax(0, 1fr) auto;
				gap: 6px;
				align-items: center;
				width: 100%;
				min-height: 26px;
				box-sizing: border-box;
				padding: 3px 4px;
				border: 0;
				border-radius: 4px;
				background: transparent;
				color: var(--cs-fg);
				font: inherit;
				font-weight: 600;
				text-align: left;
				cursor: pointer;
			}

			.group-toggle:hover {
				background: var(--cs-icon-hover-bg);
			}

			.group-title,
			.group-count {
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.group-count {
				color: var(--cs-fg-muted);
				font-weight: 400;
				font-size: calc(var(--vscode-font-size) - 1px);
			}

			.group-records {
				display: grid;
				gap: 6px;
				margin-top: 4px;
			}

			cs-card.spec-card {
				cursor: grab;
			}

			cs-card.spec-card[dragging='true'] {
				opacity: 0.55;
				cursor: grabbing;
			}

			cs-card.spec-card[active-worktree='true'] {
				border-color: var(--vscode-gitDecoration-addedResourceForeground, var(--cs-focus));
				background: color-mix(in srgb, var(--cs-card-bg) 82%, var(--vscode-gitDecoration-addedResourceForeground, var(--cs-focus)) 18%);
			}

			.active-worktree-label {
				color: var(--vscode-gitDecoration-addedResourceForeground, var(--cs-focus));
				font-weight: 600;
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

			.spec-phase-actions {
				display: inline-flex;
				align-items: center;
				gap: 1px;
				vertical-align: middle;
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
	@state() private specGroups: readonly SpecRecordGroup[] = [];
	@state() private specStatusOptions: readonly string[] = [];
	@state() private workspaces: readonly string[] = [];
	@state() private selectedWorkspace = '';
	@state() private domainFilter?: string;
	@state() private domainOptions: readonly string[] = [];
	@state() private filtersEnabled = false;
	@state() private actionMode: RecordActionMode = 'accepted';
	@state() private emptyText = 'No accepted decision records yet.';
	@state() private diagnosticsEnabled = false;
	@state() private retirePromptRecordId?: string;
	@state() private draggedSpec?: Pick<RecordSummary, 'id' | 'status' | 'workspace'>;
	@state() private dragTargetStatus?: string;

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
				...(this.actionMode === 'specs' ? {
					groupCount: this.renderRoot.querySelectorAll('.spec-group').length,
					openBoardButtonVisible: this.renderRoot.querySelector('[data-action="open-kanban"]') !== null,
					specAddFormVisible: this.renderRoot.querySelector('[data-action="add-spec"]') !== null,
					specWorktreeActionCount: this.renderRoot.querySelectorAll('[data-record-target="worktree"]').length,
					specDeleteActionCount: this.renderRoot.querySelectorAll('[data-record-target="delete"]').length,
				} : {}),
			},
		});
	}

	render() {
		if (this.actionMode === 'specs') {
			return this.renderSpecs();
		}

		return html`
			${this.filtersEnabled ? this.renderFilters() : nothing}
			${this.records.length === 0
				? html`<div class="empty">${this.emptyText}</div>`
				: this.records.map(record => this.renderRecord(record))}
		`;
	}

	private renderSpecs() {
		return html`
			<button
				class="specs-launcher"
				type="button"
				data-action="open-kanban"
				@click=${() => this.send({ kind: 'openBoard' })}
			>
				<cs-icon icon="list-tree"></cs-icon>
				<span>Open Kanban View</span>
			</button>
			${this.renderSpecAddForm()}
			${this.records.length === 0
				? html`<div class="empty">${this.emptyText}</div>`
				: this.renderSpecGroups()}
		`;
	}

	private renderSpecAddForm() {
		return html`
			<form
				class="spec-add-form"
				data-action="add-spec"
				data-has-workspaces=${this.workspaces.length > 1 ? 'true' : 'false'}
				aria-label="Add spec"
				@submit=${this.handleCreateSpec}
			>
				<input name="title" type="text" aria-label="Spec title" placeholder="New spec" autocomplete="off" />
				${this.workspaces.length <= 1 ? nothing : html`
					<select name="workspace" aria-label="Workspace" .value=${this.selectedWorkspace} @change=${this.handleWorkspaceChange}>
						${this.workspaces.map(workspace => html`<option value=${workspace}>${workspace}</option>`)}
					</select>
				`}
				<button class="spec-add-button" type="submit">
					<cs-icon icon="add"></cs-icon>
					<span>Add</span>
				</button>
			</form>
		`;
	}

	private renderSpecGroups() {
		const groups = this.specGroups.length === 0
			? groupRecordsByStatus(this.records)
			: this.specGroups;
		return groups.map(group => this.renderSpecGroup(group));
	}

	private renderSpecGroup(group: SpecRecordGroup) {
		const collapsed = group.collapsed === true;
		return html`
			<section
				class="spec-group"
				data-spec-group=${group.status}
				data-drop-target=${this.dragTargetStatus === group.status ? 'true' : 'false'}
				@dragenter=${(event: DragEvent) => this.handleSpecGroupDragEnter(event, group.status)}
				@dragover=${this.handleSpecGroupDragOver}
				@dragleave=${(event: DragEvent) => this.handleSpecGroupDragLeave(event, group.status)}
				@drop=${(event: DragEvent) => this.handleSpecGroupDrop(event, group.status)}
			>
				<button
					class="group-toggle"
					type="button"
					aria-expanded=${collapsed ? 'false' : 'true'}
					@click=${() => this.toggleSpecGroup(group)}
				>
					<cs-icon icon=${collapsed ? 'chevron-right' : 'chevron-down'}></cs-icon>
					<span class="group-title">${group.status}</span>
					<span class="group-count">${group.records.length}</span>
				</button>
				${collapsed
					? nothing
					: html`<div class="group-records">${group.records.map(record => this.renderRecord(record, { showStatusBadge: false }))}</div>`}
			</section>
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

	private renderRecord(record: RecordSummary, options: { readonly showStatusBadge?: boolean } = {}) {
		const retirePromptOpen = this.actionMode === 'accepted' && this.retirePromptRecordId === record.id;
		const showStatusBadge = options.showStatusBadge ?? true;
		const isSpec = this.actionMode === 'specs';
		return html`
			<cs-card
				class=${isSpec ? 'spec-card' : ''}
				?draggable=${isSpec}
				dragging=${this.draggedSpec?.id === record.id && this.draggedSpec?.workspace === record.workspace ? 'true' : 'false'}
				active-worktree=${record.activeWorktree === true ? 'true' : 'false'}
				data-spec-id=${record.id}
				@dragstart=${(event: DragEvent) => this.handleSpecDragStart(event, record)}
				@dragend=${this.handleSpecDragEnd}
			>
				<button
					slot="title"
					class="title-button"
					type="button"
					title=${record.title}
					data-record-id=${record.id}
					data-record-target="title"
					data-record-workspace=${record.workspace ?? nothing}
					@click=${() => this.send({ kind: 'preview', id: record.id })}
				>${record.title}</button>
				<span slot="meta">
					<span class=${record.activeWorktree === true ? 'id active-worktree-label' : 'id'}>${record.id}${record.activeWorktree === true ? ' [Active Worktree]' : ''}</span>
					${isSpec && this.isSelectedWorkspace(record)
						? html`<span class="spec-phase-actions">${this.renderSpecPhaseActions(record)}</span>`
						: nothing}
					${this.actionMode === 'specs'
						? showStatusBadge
						? html`<cs-badge variant="inverse">${record.status ?? 'Planning'}</cs-badge>`
						: nothing
						: html`<cs-badge variant="inverse">${record.domain}</cs-badge>`}
					${record.enabled ? nothing : html`<cs-badge>disabled</cs-badge>`}
					${record.workspace === undefined ? nothing : html`<span>${record.workspace}</span>`}
				</span>
				<div slot="actions">${this.renderActions(record)}</div>
				${this.actionMode === 'research' && record.summary !== undefined && record.summary.length > 0
					? html`<p slot="body" class="summary">${record.summary}</p>`
					: nothing}
				${retirePromptOpen ? this.renderRetirePrompt(record) : nothing}
			</cs-card>
		`;
	}

	private renderActions(record: RecordSummary) {
		if (this.actionMode === 'specs') {
			const spawnWorktreeDisabled = record.worktreeSpawnDisabled === true;
			return html`
				<cs-icon-button
					icon="repo-forked"
					label=${spawnWorktreeDisabled ? 'Spawn worktree unavailable from a worktree' : 'Spawn worktree'}
					?disabled=${spawnWorktreeDisabled}
					data-record-id=${record.id}
					data-record-target="worktree"
					data-record-workspace=${record.workspace ?? nothing}
					@click=${() => this.send({
						kind: 'spawnSpecWorktree',
						id: record.id,
						...(record.workspace === undefined ? {} : { workspace: record.workspace }),
					})}
				></cs-icon-button>
				<cs-icon-button
					icon="trash"
					label="Delete spec"
					data-record-id=${record.id}
					data-record-target="delete"
					data-record-workspace=${record.workspace ?? nothing}
					@click=${() => this.send({
						kind: 'deleteSpec',
						id: record.id,
						...(record.workspace === undefined ? {} : { workspace: record.workspace }),
					})}
				></cs-icon-button>
			`;
		}

		const baseActions = html`
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

		if (this.actionMode === 'research') {
			return baseActions;
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

	private renderSpecPhaseActions(record: RecordSummary) {
		return html`
			<cs-icon-button
				icon="list-tree"
				label="Plan spec"
				data-record-id=${record.id}
				data-record-target="planning"
				data-record-workspace=${record.workspace ?? nothing}
				@click=${() => this.launchSpec(record, 'planning')}
			></cs-icon-button>
			<cs-icon-button
				icon="replace"
				label="Implement spec"
				data-record-id=${record.id}
				data-record-target="implementation"
				data-record-workspace=${record.workspace ?? nothing}
				@click=${() => this.launchSpec(record, 'implementation')}
			></cs-icon-button>
			<cs-icon-button
				icon="eye"
				label="Review spec"
				data-record-id=${record.id}
				data-record-target="review"
				data-record-workspace=${record.workspace ?? nothing}
				@click=${() => this.launchSpec(record, 'review')}
			></cs-icon-button>
		`;
	}

	private isSelectedWorkspace(record: RecordSummary): boolean {
		return record.workspace === undefined || record.workspace === this.selectedWorkspace;
	}

	private launchSpec(record: RecordSummary, phase: SpecSessionPhase): void {
		this.send({
			kind: 'launchSpec',
			id: record.id,
			phase,
			...(record.workspace === undefined ? {} : { workspace: record.workspace }),
		});
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
				this.specGroups = message.specGroups ?? [];
				this.specStatusOptions = message.specStatusOptions ?? [];
				this.workspaces = message.workspaces ?? [];
				this.domainFilter = message.domainFilter;
				this.domainOptions = message.domainOptions ?? [];
				this.filtersEnabled = message.domainOptions !== undefined;
				this.actionMode = message.actionMode ?? 'accepted';
				this.emptyText = message.emptyText ?? 'No accepted decision records yet.';
				this.diagnosticsEnabled = message.diagnosticsEnabled === true;
				this.updateWorkspaceSelection();
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
			case 'diagnosticClickRecord':
				if (this.diagnosticsEnabled) {
					this.clickRecordForDiagnostics(message.id, message.target, message.workspace);
				}
				return;
			case 'diagnosticCreateSpec':
				if (this.diagnosticsEnabled) {
					this.send({
						kind: 'createSpec',
						title: message.title,
						status: message.status ?? this.defaultSpecStatus(),
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
					});
				}
				return;
			case 'diagnosticMoveSpec':
				if (this.diagnosticsEnabled) {
					this.send({
						kind: 'moveSpec',
						id: message.id,
						status: message.status,
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
					});
				}
				return;
			case 'diagnosticDeleteSpec':
				if (this.diagnosticsEnabled) {
					this.send({
						kind: 'deleteSpec',
						id: message.id,
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
						...(message.skipConfirmation === true ? { skipConfirmation: true } : {}),
					});
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

	private toggleSpecGroup(group: SpecRecordGroup): void {
		const collapsed = group.collapsed !== true;
		this.specGroups = this.specGroups.map(item => item.status === group.status
			? { ...item, collapsed }
			: item);
		this.send({ kind: 'toggleSpecGroup', status: group.status, collapsed });
	}

	private handleCreateSpec = (event: SubmitEvent): void => {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) {
			return;
		}

		const data = new FormData(form);
		const title = formValue(data, 'title').trim();
		const status = this.defaultSpecStatus();
		const workspace = formValue(data, 'workspace').trim() || undefined;
		if (title.length === 0 || status.length === 0) {
			return;
		}

		this.send({
			kind: 'createSpec',
			title,
			status,
			...(workspace === undefined ? {} : { workspace }),
		});
		const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
		if (titleInput !== null) {
			titleInput.value = '';
		}
	};

	private handleWorkspaceChange = (event: Event): void => {
		const target = event.currentTarget;
		if (target instanceof HTMLSelectElement) {
			this.selectedWorkspace = target.value;
		}
	};

	private handleSpecDragStart(event: DragEvent, record: RecordSummary): void {
		if (event.dataTransfer === null) {
			return;
		}

		const status = record.status ?? '';
		if (status.length === 0) {
			return;
		}

		this.draggedSpec = {
			id: record.id,
			status,
			...(record.workspace === undefined ? {} : { workspace: record.workspace }),
		};
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('application/vnd.sundial.spec+json', JSON.stringify(this.draggedSpec));
		event.dataTransfer.setData('text/plain', record.id);
	}

	private readonly handleSpecDragEnd = (): void => {
		this.draggedSpec = undefined;
		this.dragTargetStatus = undefined;
	};

	private handleSpecGroupDragEnter(event: DragEvent, status: string): void {
		if (this.draggedSpec === undefined) {
			return;
		}

		event.preventDefault();
		this.dragTargetStatus = status;
	}

	private readonly handleSpecGroupDragOver = (event: DragEvent): void => {
		if (this.draggedSpec === undefined) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer !== null) {
			event.dataTransfer.dropEffect = 'move';
		}
	};

	private handleSpecGroupDragLeave(event: DragEvent, status: string): void {
		if (event.currentTarget instanceof HTMLElement
			&& event.relatedTarget instanceof Node
			&& event.currentTarget.contains(event.relatedTarget)) {
			return;
		}

		if (this.dragTargetStatus === status) {
			this.dragTargetStatus = undefined;
		}
	}

	private handleSpecGroupDrop(event: DragEvent, status: string): void {
		event.preventDefault();
		this.dragTargetStatus = undefined;
		const spec = this.specFromDragEvent(event);
		if (spec === undefined || spec.status === status) {
			return;
		}

		this.send({
			kind: 'moveSpec',
			id: spec.id,
			status,
			...(spec.workspace === undefined ? {} : { workspace: spec.workspace }),
		});
	}

	private specFromDragEvent(event: DragEvent): Pick<RecordSummary, 'id' | 'status' | 'workspace'> | undefined {
		const raw = event.dataTransfer?.getData('application/vnd.sundial.spec+json');
		if (raw === undefined || raw.length === 0) {
			return undefined;
		}

		try {
			const value = JSON.parse(raw) as { id?: unknown; status?: unknown; workspace?: unknown };
			if (typeof value.id !== 'string'
				|| typeof value.status !== 'string'
				|| (value.workspace !== undefined && typeof value.workspace !== 'string')) {
				return undefined;
			}

			return {
				id: value.id,
				status: value.status,
				...(value.workspace === undefined ? {} : { workspace: value.workspace }),
			};
		} catch {
			return undefined;
		}
	}

	private effectiveSpecStatusOptions(): readonly string[] {
		if (this.specStatusOptions.length > 0) {
			return this.specStatusOptions;
		}

		const groups = this.specGroups.length === 0 ? groupRecordsByStatus(this.records) : this.specGroups;
		return groups.map(group => group.status);
	}

	private defaultSpecStatus(): string {
		const statuses = this.effectiveSpecStatusOptions();
		return statuses.includes('Backlog') ? 'Backlog' : statuses[0] ?? '';
	}

	private updateWorkspaceSelection(): void {
		if (this.workspaces.length > 0 && !this.workspaces.includes(this.selectedWorkspace)) {
			this.selectedWorkspace = this.workspaces[0];
		}
	}

	private selectFilterForDiagnostics(filter: 'domain', value: string | undefined): void {
		const select = this.renderRoot.querySelector<HTMLSelectElement>(`select[data-filter="${filter}"]`);
		if (select === null) {
			return;
		}

		select.value = value ?? '';
		select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
	}

	private clickRecordForDiagnostics(id: string, target: RecordClickTarget, workspace: string | undefined): void {
		const workspaceSelector = workspace === undefined ? '' : `[data-record-workspace="${CSS.escape(workspace)}"]`;
		const selector = `[data-record-id="${CSS.escape(id)}"][data-record-target="${target}"]${workspaceSelector}`;
		const element = this.renderRoot.querySelector<HTMLElement>(selector);
		element?.click();
	}

	private focusElement(element: HTMLElement): void {
		const shadowButton = element.shadowRoot?.querySelector<HTMLButtonElement>('button');
		(shadowButton ?? element).focus();
	}

	private send(message: WebviewToHost): void {
		this.host.postMessage(message);
	}
}

function groupRecordsByStatus(records: readonly RecordSummary[]): readonly SpecRecordGroup[] {
	const groups = new Map<string, RecordSummary[]>();
	for (const record of records) {
		const status = record.status ?? 'Planning';
		const group = groups.get(status) ?? [];
		group.push(record);
		groups.set(status, group);
	}

	return [...groups].map(([status, groupRecords]) => ({
		status,
		records: groupRecords,
	}));
}

function filterValue<Key extends 'domainFilter'>(
	value: string,
	key: Key,
): Partial<Record<Key, string>> {
	return value.length === 0 ? {} : { [key]: value } as Partial<Record<Key, string>>;
}

function formValue(data: FormData, key: string): string {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
}
