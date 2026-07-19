import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { assertNever } from '../shared/guards.js';
import { connectRefreshTriggers, getHost, readInitialState } from '../shared/host.js';
import { focusRing, tokenStyles } from '../shared/styles.js';
import {
	type HostToWebview,
	type SpecCard,
	type WebviewToHost,
	isHostToWebview,
} from '../../specs/messages.js';
import { isSpecSessionPhase, type SpecSessionPhase } from '../../../specSessions.js';
import '../shared/components/cs-card.js';
import '../shared/components/cs-icon.js';
import '../shared/components/cs-icon-button.js';

@customElement('cs-specs-board-app')
export class SpecsBoardApp extends LitElement {
	static styles = [
		tokenStyles,
		focusRing,
		css`
			:host {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr);
				height: 100vh;
				box-sizing: border-box;
				padding: 10px;
				background: var(--cs-bg);
				color: var(--cs-fg);
				overflow: hidden;
			}

			.toolbar {
				display: grid;
				grid-template-columns: minmax(180px, 1fr) minmax(120px, 180px) minmax(120px, 180px) auto;
				gap: 8px;
				align-items: end;
				padding-bottom: 10px;
			}

			.toolbar[data-single-workspace='true'] {
				grid-template-columns: minmax(180px, 1fr) minmax(120px, 180px) auto;
			}

			label {
				display: grid;
				gap: 3px;
				min-width: 0;
				color: var(--cs-fg-muted);
				font-size: calc(var(--vscode-font-size) - 1px);
			}

			input,
			select {
				width: 100%;
				min-width: 0;
				height: 28px;
				box-sizing: border-box;
				border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, var(--cs-card-border)));
				border-radius: 2px;
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font: inherit;
			}

			input {
				padding: 4px 7px;
			}

			select {
				padding: 3px 6px;
				background: var(--vscode-dropdown-background);
				color: var(--vscode-dropdown-foreground);
			}

			input:focus,
			select:focus {
				outline: 1px solid var(--cs-focus);
				outline-offset: -1px;
			}

			.add-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 6px;
				height: 28px;
				padding: 4px 12px;
				border: 1px solid transparent;
				border-radius: 2px;
				background: var(--cs-button-bg);
				color: var(--cs-button-fg);
				font: inherit;
				cursor: pointer;
			}

			.add-button:hover {
				background: var(--cs-button-hover);
			}

			.board {
				display: grid;
				grid-auto-flow: column;
				grid-auto-columns: minmax(240px, 320px);
				gap: 10px;
				min-width: 0;
				min-height: 0;
				overflow-x: auto;
				overflow-y: auto;
				padding-bottom: 6px;
			}

			.lane {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr);
				min-height: 0;
				border: 1px solid var(--cs-card-border);
				border-radius: 4px;
				background: color-mix(in srgb, var(--cs-bg) 94%, var(--cs-fg) 6%);
			}

			.lane-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 8px;
				min-width: 0;
				padding: 8px 10px;
				border-bottom: 1px solid var(--cs-card-border);
			}

			.lane-title {
				margin: 0;
				font-size: var(--vscode-font-size);
				font-weight: 700;
				overflow-wrap: anywhere;
			}

			.count {
				flex-shrink: 0;
				min-width: 20px;
				padding: 1px 6px;
				border-radius: 10px;
				background: var(--cs-badge-bg);
				color: var(--cs-badge-fg);
				font-size: calc(var(--vscode-font-size) - 1px);
				text-align: center;
			}

			.cards {
				padding: 8px;
			}

			.empty-board,
			.empty-lane {
				color: var(--cs-fg-muted);
				line-height: 1.4;
			}

			.empty-board {
				padding: 16px;
			}

			.empty-lane {
				padding: 4px 2px;
			}

			.lane[data-drop-target='true'] {
				outline: 1px solid var(--cs-focus);
				outline-offset: -1px;
			}

			.spec-card {
				cursor: grab;
			}

			.spec-card[dragging='true'] {
				opacity: 0.55;
				cursor: grabbing;
			}

			.spec-card[active-worktree='true'] {
				border-color: var(--vscode-gitDecoration-addedResourceForeground, var(--cs-focus));
				background: color-mix(in srgb, var(--cs-card-bg) 82%, var(--vscode-gitDecoration-addedResourceForeground, var(--cs-focus)) 18%);
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

			.id {
				font-family: var(--vscode-editor-font-family);
			}

			.active-worktree-label {
				color: var(--vscode-gitDecoration-addedResourceForeground, var(--cs-focus));
				font-weight: 600;
			}

			@media (max-width: 720px) {
				:host {
					height: auto;
					min-height: 100vh;
					overflow: auto;
				}

				.toolbar,
				.toolbar[data-single-workspace='true'] {
					grid-template-columns: minmax(0, 1fr);
				}

				.board {
					grid-auto-flow: row;
					grid-auto-columns: auto;
					grid-template-columns: minmax(0, 1fr);
					overflow: visible;
				}

				.lane {
					min-height: 160px;
				}
			}
		`,
	];

	private readonly host = getHost<WebviewToHost, HostToWebview>();
	private stopRefreshTriggers?: () => void;
	@state() private lanes: readonly string[] = [];
	@state() private specs: readonly SpecCard[] = [];
	@state() private workspaces: readonly string[] = [];
	@state() private selectedWorkspace = '';
	@state() private diagnosticsEnabled = false;
	@state() private draggedSpecId?: string;
	@state() private dragTargetLane?: string;

	connectedCallback(): void {
		super.connectedCallback();
		const persisted = this.host.getState();
		const initial = persisted !== undefined && isHostToWebview(persisted)
			? persisted
			: readInitialState<HostToWebview>();
		if (initial !== undefined && isHostToWebview(initial) && initial.kind === 'state') {
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
				laneCount: this.lanes.length,
				specCount: this.specs.length,
				cardCount: this.renderRoot.querySelectorAll('cs-card').length,
				emptyVisible: this.renderRoot.querySelector('.empty-board') !== null,
				worktreeActionCount: this.renderRoot.querySelectorAll('[data-spec-target="worktree"]').length,
			},
		});
	}

	render() {
		return html`
			<form
				class="toolbar"
				data-single-workspace=${this.workspaces.length <= 1 ? 'true' : 'false'}
				@submit=${this.handleCreate}
			>
				<label>
					<span>Title</span>
					<input name="title" type="text" autocomplete="off" />
				</label>
				<label>
					<span>Status</span>
					<select name="status">
						${this.lanes.map(lane => html`<option value=${lane}>${lane}</option>`)}
					</select>
				</label>
				${this.workspaces.length <= 1 ? nothing : html`
					<label>
						<span>Workspace</span>
						<select name="workspace" .value=${this.selectedWorkspace} @change=${this.handleWorkspaceChange}>
							${this.workspaces.map(workspace => html`<option value=${workspace}>${workspace}</option>`)}
						</select>
					</label>
				`}
				<button class="add-button" type="submit">
					<cs-icon icon="add"></cs-icon>
					<span>Add</span>
				</button>
			</form>
			${this.renderBoard()}
		`;
	}

	private renderBoard() {
		if (this.lanes.length === 0) {
			return html`<div class="empty-board">No lanes configured.</div>`;
		}

		return html`
			<div class="board" role="list" aria-label="Specs board">
				${this.lanes.map(lane => this.renderLane(lane))}
			</div>
		`;
	}

	private renderLane(lane: string) {
		const specs = this.specs.filter(spec => spec.status === lane);
		const titleId = `lane-${lane.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
		return html`
			<section
				class="lane"
				role="listitem"
				aria-labelledby=${titleId}
				data-lane=${lane}
				data-drop-target=${this.dragTargetLane === lane ? 'true' : 'false'}
				@dragenter=${(event: DragEvent) => this.handleLaneDragEnter(event, lane)}
				@dragover=${this.handleLaneDragOver}
				@dragleave=${(event: DragEvent) => this.handleLaneDragLeave(event, lane)}
				@drop=${(event: DragEvent) => this.handleLaneDrop(event, lane)}
			>
				<header class="lane-header">
					<h2 class="lane-title" id=${titleId}>${lane}</h2>
					<span class="count">${specs.length}</span>
				</header>
				<div class="cards">
					${specs.length === 0
						? html`<div class="empty-lane">Empty</div>`
						: specs.map(spec => this.renderCard(spec))}
				</div>
			</section>
		`;
	}

	private renderCard(spec: SpecCard) {
		const spawnWorktreeDisabled = spec.worktreeSpawnDisabled === true;
		return html`
			<cs-card
				class="spec-card"
				draggable="true"
				dragging=${this.draggedSpecId === spec.id ? 'true' : 'false'}
				active-worktree=${spec.activeWorktree === true ? 'true' : 'false'}
				data-spec-id=${spec.id}
				@dragstart=${(event: DragEvent) => this.handleCardDragStart(event, spec)}
				@dragend=${this.handleCardDragEnd}
			>
				<button
					slot="title"
					class="title-button"
					type="button"
					title=${spec.title}
					data-spec-id=${spec.id}
					data-spec-target="open"
					@click=${() => this.send({ kind: 'open', id: spec.id, ...(spec.workspace === undefined ? {} : { workspace: spec.workspace }) })}
				>${spec.title}</button>
				<span slot="meta">
					<span class=${spec.activeWorktree === true ? 'id active-worktree-label' : 'id'}>${spec.id}${spec.activeWorktree === true ? ' [Active Worktree]' : ''}</span>
					${this.isSelectedWorkspace(spec)
						? html`<span class="spec-phase-actions">${this.renderSpecPhaseActions(spec)}</span>`
						: nothing}
					${spec.workspace === undefined ? nothing : html`<span>${spec.workspace}</span>`}
				</span>
				<div slot="actions">
					<cs-icon-button
						icon="repo-forked"
						label=${spawnWorktreeDisabled ? 'Spawn worktree unavailable from a worktree' : 'Spawn worktree'}
						?disabled=${spawnWorktreeDisabled}
						data-spec-id=${spec.id}
						data-spec-target="worktree"
						@click=${() => this.send({ kind: 'spawnWorktree', id: spec.id, ...(spec.workspace === undefined ? {} : { workspace: spec.workspace }) })}
					></cs-icon-button>
					<cs-icon-button
						icon="archive"
						label="Archive spec"
						data-spec-id=${spec.id}
						data-spec-target="archive"
						@click=${() => this.send({ kind: 'move', id: spec.id, status: 'Archive', ...(spec.workspace === undefined ? {} : { workspace: spec.workspace }) })}
					></cs-icon-button>
					<cs-icon-button
						icon="trash"
						label="Delete spec"
						data-spec-id=${spec.id}
						data-spec-target="delete"
						@click=${() => this.send({ kind: 'delete', id: spec.id, ...(spec.workspace === undefined ? {} : { workspace: spec.workspace }) })}
					></cs-icon-button>
				</div>
			</cs-card>
		`;
	}

	private renderSpecPhaseActions(spec: SpecCard) {
		return html`
			<cs-icon-button
				icon="list-tree"
				label="Plan spec"
				data-spec-id=${spec.id}
				data-spec-target="planning"
				@click=${() => this.launchSpec(spec, 'planning')}
			></cs-icon-button>
			<cs-icon-button
				icon="replace"
				label="Implement spec"
				data-spec-id=${spec.id}
				data-spec-target="implementation"
				@click=${() => this.launchSpec(spec, 'implementation')}
			></cs-icon-button>
			<cs-icon-button
				icon="eye"
				label="Review spec"
				data-spec-id=${spec.id}
				data-spec-target="review"
				@click=${() => this.launchSpec(spec, 'review')}
			></cs-icon-button>
		`;
	}

	private isSelectedWorkspace(spec: SpecCard): boolean {
		return spec.workspace === undefined || spec.workspace === this.selectedWorkspace;
	}

	private launchSpec(spec: SpecCard, phase: SpecSessionPhase): void {
		this.send({
			kind: 'launch',
			id: spec.id,
			phase,
			...(spec.workspace === undefined ? {} : { workspace: spec.workspace }),
		});
	}

	private readonly handleMessage = (event: MessageEvent<unknown>): void => {
		if (!isHostToWebview(event.data)) {
			return;
		}

		const message = event.data;
		switch (message.kind) {
			case 'state':
				this.applyState(message);
				return;
			case 'diagnosticClickSpec':
				if (isSpecSessionPhase(message.target)) {
					this.send({
						kind: 'launch',
						id: message.id,
						phase: message.target,
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
					});
				} else if (message.target === 'archive') {
					this.send({
						kind: 'move',
						id: message.id,
						status: 'Archive',
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
					});
				} else if (message.target === 'worktree') {
					this.send({
						kind: 'spawnWorktree',
						id: message.id,
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
					});
				} else {
					this.send({
						kind: message.target === 'open' ? 'open' : 'delete',
						id: message.id,
						...(message.workspace === undefined ? {} : { workspace: message.workspace }),
					});
				}
				return;
			case 'diagnosticCreateSpec':
				this.send({
					kind: 'create',
					title: message.title,
					status: message.status,
					...(message.workspace === undefined ? {} : { workspace: message.workspace }),
				});
				return;
			case 'diagnosticMoveSpec':
				this.send({
					kind: 'move',
					id: message.id,
					status: message.status,
					...(message.workspace === undefined ? {} : { workspace: message.workspace }),
				});
				return;
			case 'diagnosticDeleteSpec':
				this.send({
					kind: 'delete',
					id: message.id,
					...(message.workspace === undefined ? {} : { workspace: message.workspace }),
				});
				return;
			default:
				assertNever(message);
		}
	};

	private applyState(message: Extract<HostToWebview, { kind: 'state' }>): void {
		this.lanes = message.lanes;
		this.specs = message.specs;
		this.workspaces = message.workspaces ?? [];
		this.diagnosticsEnabled = message.diagnosticsEnabled === true;
		if (this.workspaces.length > 0 && !this.workspaces.includes(this.selectedWorkspace)) {
			this.selectedWorkspace = this.workspaces[0];
		}

		this.host.setState(message);
	}

	private handleCreate(event: SubmitEvent): void {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) {
			return;
		}

		const data = new FormData(form);
		const title = formValue(data, 'title').trim();
		const status = formValue(data, 'status').trim();
		const workspace = formValue(data, 'workspace').trim() || undefined;
		if (title.length === 0 || status.length === 0) {
			return;
		}

		this.send({
			kind: 'create',
			title,
			status,
			...(workspace === undefined ? {} : { workspace }),
		});
		form.reset();
	}

	private handleWorkspaceChange(event: Event): void {
		const target = event.currentTarget;
		if (target instanceof HTMLSelectElement) {
			this.selectedWorkspace = target.value;
		}
	}

	private handleCardDragStart(event: DragEvent, spec: SpecCard): void {
		if (event.dataTransfer === null) {
			return;
		}

		this.draggedSpecId = spec.id;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('application/vnd.sundial.spec+json', JSON.stringify({
			id: spec.id,
			status: spec.status,
			...(spec.workspace === undefined ? {} : { workspace: spec.workspace }),
		}));
		event.dataTransfer.setData('text/plain', spec.id);
	}

	private readonly handleCardDragEnd = (): void => {
		this.draggedSpecId = undefined;
		this.dragTargetLane = undefined;
	};

	private handleLaneDragEnter(event: DragEvent, lane: string): void {
		if (this.draggedSpecId === undefined) {
			return;
		}

		event.preventDefault();
		this.dragTargetLane = lane;
	}

	private readonly handleLaneDragOver = (event: DragEvent): void => {
		if (this.draggedSpecId === undefined) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer !== null) {
			event.dataTransfer.dropEffect = 'move';
		}
	};

	private handleLaneDragLeave(event: DragEvent, lane: string): void {
		if (event.currentTarget instanceof HTMLElement
			&& event.relatedTarget instanceof Node
			&& event.currentTarget.contains(event.relatedTarget)) {
			return;
		}

		if (this.dragTargetLane === lane) {
			this.dragTargetLane = undefined;
		}
	}

	private handleLaneDrop(event: DragEvent, lane: string): void {
		event.preventDefault();
		this.dragTargetLane = undefined;
		const spec = this.specFromDragEvent(event);
		if (spec === undefined || spec.status === lane) {
			return;
		}

		this.send({
			kind: 'move',
			id: spec.id,
			status: lane,
			...(spec.workspace === undefined ? {} : { workspace: spec.workspace }),
		});
	}

	private specFromDragEvent(event: DragEvent): Pick<SpecCard, 'id' | 'status' | 'workspace'> | undefined {
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

	private send(message: WebviewToHost): void {
		this.host.postMessage(message);
	}
}

function formValue(data: FormData, key: string): string {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
}
