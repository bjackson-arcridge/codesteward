import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { tokenStyles } from '../styles.js';

@customElement('cs-badge')
export class CsBadge extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: inline-flex;
				align-items: center;
				padding: 1px 6px;
				border-radius: 9px;
				background: var(--cs-badge-bg);
				color: var(--cs-badge-fg);
				font-size: calc(var(--vscode-font-size) - 2px);
				line-height: 1.4;
			}

			:host([variant='inverse']) {
				background: var(--cs-badge-inverse-bg);
				color: var(--cs-badge-inverse-fg);
			}
		`,
	];

	render() {
		return html`<slot></slot>`;
	}
}
