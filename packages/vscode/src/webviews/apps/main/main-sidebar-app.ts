import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
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
	sidebarSections,
} from '../../main/messages.js';
import '../candidates/candidates-app.js';
import '../records/records-app.js';
import '../shared/components/cs-icon.js';

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
	@state() private sectionStates: Partial<Record<SidebarSection, SectionHostToWebview>> = {};

	connectedCallback(): void {
		super.connectedCallback();
		const initial = readInitialState<HostToWebview>();
		if (initial !== undefined && isHostToWebview(initial)) {
			this.applyHostMessage(initial);
		} else {
			const persisted = this.host.getState();
			if (persisted !== undefined && sidebarSections.includes(persisted.activeSection)) {
				this.activeSection = persisted.activeSection;
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
		return sidebarSections.map(section => this.renderSection(section));
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
		this.host.setState({ activeSection: section });
		this.host.postMessage({ kind: 'selectSection', section });
	}

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
				this.host.setState({ activeSection: message.activeSection });
				this.setSectionState(message.activeSection, message.sectionState);
				return;
			case 'sectionMessage':
				this.setSectionState(message.section, message.message);
				return;
		}
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
