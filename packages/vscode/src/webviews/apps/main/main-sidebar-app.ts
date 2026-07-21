import { LitElement, css, html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import type { CandidatesApp } from '../candidates/candidates-app.js';
import type { RecordsApp } from '../records/records-app.js';
import { getHost, readInitialState } from '../shared/host.js';
import { tokenStyles } from '../shared/styles.js';
import {
	type HostToWebview,
	type SectionHostToWebview,
	type SectionWebviewToHost,
	type SidebarSection,
	type WebviewToHost,
	isHostToWebview,
	isSidebarSection,
	sidebarSections,
} from '../../main/messages.js';
import '../candidates/candidates-app.js';
import '../records/records-app.js';
import '../shared/components/cs-icon.js';
import '../shared/components/cs-menu-item.js';
import '../shared/components/cs-menu.js';
import '../shared/components/cs-popover.js';
import type { CsPopover } from '../shared/components/cs-popover.js';

const sectionLabels: Readonly<Record<SidebarSection, string>> = {
	records: 'Decision Records',
	research: 'Research',
	specs: 'Specs',
	candidates: 'Candidates',
	rejected: 'Rejected DRs',
	retired: 'Retired DRs',
};

interface PersistedState {
	readonly activeSection: SidebarSection;
	readonly visibleSections: readonly SidebarSection[];
}

@customElement('cs-main-sidebar-app')
export class MainSidebarApp extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				position: fixed;
				inset: 0;
				display: flex;
				box-sizing: border-box;
				flex-direction: column;
				overflow: hidden;
				background: var(--cs-bg);
			}

			.section {
				display: flex;
				min-height: 0;
				flex: none;
				flex-direction: column;
			}

			.section.active {
				flex: 1;
			}

			.section-toggle {
				display: grid;
				grid-template-columns: 16px minmax(0, 1fr);
				align-items: center;
				gap: 4px;
				width: 100%;
				min-height: 24px;
				box-sizing: border-box;
				padding: 2px 8px;
				border: 0;
				border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, transparent));
				background: var(--vscode-sideBarSectionHeader-background, var(--cs-bg));
				color: var(--vscode-sideBarSectionHeader-foreground, var(--cs-fg));
				font: inherit;
				font-size: calc(var(--vscode-font-size) - 1px);
				font-weight: 700;
				text-align: left;
				text-transform: uppercase;
				cursor: pointer;
			}

			.section-toggle:hover {
				background: var(--vscode-list-hoverBackground);
			}

			.section-toggle:focus-visible {
				outline: 1px solid var(--cs-focus);
				outline-offset: -1px;
			}

			.section-content {
				min-height: 0;
				flex: 1;
				overflow: auto;
			}
		`,
	];

	private readonly host = getHost<WebviewToHost, PersistedState>();
	@state() private activeSection: SidebarSection = 'records';
	@state() private visibleSections: readonly SidebarSection[] = sidebarSections;
	@state() private sectionStates: Partial<Record<SidebarSection, SectionHostToWebview>> = {};
	@query('cs-popover') private contextMenu?: CsPopover;

	connectedCallback(): void {
		super.connectedCallback();
		const initial = readInitialState<HostToWebview>();
		if (initial !== undefined && isHostToWebview(initial)) {
			this.applyHostMessage(initial);
		} else {
			const persisted = this.host.getState();
			if (persisted !== undefined
				&& sidebarSections.includes(persisted.activeSection)
				&& this.isVisibleSections(persisted.visibleSections)
				&& persisted.visibleSections.includes(persisted.activeSection)) {
				this.activeSection = persisted.activeSection;
				this.visibleSections = persisted.visibleSections;
			}
		}
		window.addEventListener('message', this.handleMessage);
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		window.removeEventListener('message', this.handleMessage);
	}

	protected updated(changed: Map<PropertyKey, unknown>): void {
		if (changed.has('sectionStates')) {
			this.deliverSectionStates();
		}
	}

	render() {
		return html`
			${sidebarSections.filter(section => this.visibleSections.includes(section)).map(section => this.renderSection(section))}
			<cs-popover>
				<cs-menu aria-label="Sidebar sections">
					${sidebarSections.map(section => html`
						<cs-menu-item
							?disabled=${this.visibleSections.length === 1 && this.visibleSections.includes(section)}
							@click=${() => this.toggleSectionVisibility(section)}
						>
							${this.visibleSections.includes(section) ? 'Hide' : 'Show'} ${sectionLabels[section]}
						</cs-menu-item>
					`) }
				</cs-menu>
			</cs-popover>
		`;
	}

	private renderSection(section: SidebarSection) {
		const active = section === this.activeSection;
		const headerId = `section-${section}-header`;
		const contentId = `section-${section}-content`;
		return html`
			<section class="section ${active ? 'active' : ''}">
				<button
					class="section-toggle"
					id=${headerId}
					type="button"
					aria-expanded=${active}
					aria-controls=${contentId}
					data-section=${section}
					@click=${() => this.selectSection(section)}
					@contextmenu=${this.handleHeaderContextMenu}
					@keydown=${this.handleHeaderKeydown}
				>
					<cs-icon icon=${active ? 'chevron-down' : 'chevron-right'}></cs-icon>
					<span>${sectionLabels[section]}</span>
				</button>
				${active ? html`
					<div
						class="section-content"
						id=${contentId}
						role="region"
						aria-labelledby=${headerId}
						@cs-section-message=${(event: CustomEvent<SectionWebviewToHost>) => this.forwardSectionMessage(section, event)}
					>
						${section === 'candidates'
							? html`<cs-candidates-app data-section-app=${section}></cs-candidates-app>`
							: html`<cs-records-app data-section-app=${section}></cs-records-app>`}
					</div>
				` : ''}
			</section>
		`;
	}

	private selectSection(section: SidebarSection): void {
		if (section === this.activeSection) {
			return;
		}
		this.activeSection = section;
		this.persistState();
		this.host.postMessage({ kind: 'selectSection', section });
	}

	private toggleSectionVisibility(section: SidebarSection): void {
		const visible = !this.visibleSections.includes(section);
		if (!visible && this.visibleSections.length === 1) {
			return;
		}
		this.visibleSections = visible
			? sidebarSections.filter(candidate => candidate === section || this.visibleSections.includes(candidate))
			: this.visibleSections.filter(candidate => candidate !== section);
		if (!this.visibleSections.includes(this.activeSection)) {
			this.activeSection = this.visibleSections[0];
			this.host.postMessage({ kind: 'selectSection', section: this.activeSection });
		}
		this.persistState();
		this.host.postMessage({ kind: 'setSectionVisibility', section, visible });
		this.contextMenu?.closeMenu(false);
	}

	private readonly handleHeaderContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
		const header = event.currentTarget;
		if (header instanceof HTMLElement) {
			this.contextMenu?.openAt(header, event.clientX, event.clientY, false);
		}
	};

	private readonly handleHeaderKeydown = (event: KeyboardEvent): void => {
		const current = event.currentTarget;
		if (!(current instanceof HTMLElement)) {
			return;
		}
		const currentIndex = sidebarSections.findIndex(section => section === current.dataset.section);
		let nextIndex: number | undefined;
		switch (event.key) {
			case 'ArrowDown':
				nextIndex = (currentIndex + 1) % sidebarSections.length;
				break;
			case 'ArrowUp':
				nextIndex = (currentIndex - 1 + sidebarSections.length) % sidebarSections.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = sidebarSections.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		this.renderRoot.querySelector<HTMLElement>(`[data-section="${sidebarSections[nextIndex]}"]`)?.focus();
	};

	private forwardSectionMessage(section: SidebarSection, event: CustomEvent<SectionWebviewToHost>): void {
		event.stopPropagation();
		this.host.postMessage({ kind: 'sectionMessage', section, message: event.detail });
	}

	private readonly handleMessage = (event: MessageEvent<unknown>): void => {
		if (isHostToWebview(event.data)) {
			this.applyHostMessage(event.data);
		}
	};

	private applyHostMessage(message: HostToWebview): void {
		switch (message.kind) {
			case 'state':
				this.activeSection = message.activeSection;
				this.visibleSections = message.visibleSections;
				this.persistState();
				this.setSectionState(message.activeSection, message.sectionState);
				return;
			case 'sectionMessage':
				this.setSectionState(message.section, message.message);
				return;
		}
	}

	private persistState(): void {
		this.host.setState({ activeSection: this.activeSection, visibleSections: this.visibleSections });
	}

	private isVisibleSections(value: unknown): value is readonly SidebarSection[] {
		return Array.isArray(value)
			&& value.length > 0
			&& value.every(isSidebarSection)
			&& new Set(value).size === value.length;
	}

	private setSectionState(section: SidebarSection, message: SectionHostToWebview): void {
		this.sectionStates = { ...this.sectionStates, [section]: message };
	}

	private deliverSectionStates(): void {
		for (const section of sidebarSections) {
			const message = this.sectionStates[section];
			if (message === undefined) {
				continue;
			}
			const app = this.renderRoot.querySelector<RecordsApp | CandidatesApp>(`[data-section-app="${section}"]`);
			app?.acceptHostMessage(message);
		}
	}
}
