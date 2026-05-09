import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { focusRing, tokenStyles } from '../styles.js';
import './cs-icon.js';

@customElement('cs-menu-item')
export class CsMenuItem extends LitElement {
	static styles = [
		tokenStyles,
		focusRing,
		css`
			:host {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 4px 12px;
				color: var(--cs-menu-fg);
				cursor: pointer;
				outline: none;
			}

			:host(:focus),
			:host(:hover) {
				background: var(--cs-menu-selection-bg);
				color: var(--cs-menu-selection-fg);
			}

			:host([aria-disabled='true']) {
				opacity: 0.55;
				cursor: default;
			}
		`,
	];

	@property({ type: String }) icon = '';
	@property({ type: Boolean, reflect: true, attribute: 'aria-disabled' }) disabled = false;

	connectedCallback(): void {
		super.connectedCallback();
		this.role = 'menuitem';
		this.tabIndex = -1;
		this.addEventListener('keydown', this.handleKeydown);
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this.removeEventListener('keydown', this.handleKeydown);
	}

	render() {
		return html`
			${this.icon ? html`<cs-icon icon=${this.icon}></cs-icon>` : null}
			<slot></slot>
		`;
	}

	private handleKeydown = (event: KeyboardEvent): void => {
		if (this.disabled) {
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.click();
		}
	};
}
