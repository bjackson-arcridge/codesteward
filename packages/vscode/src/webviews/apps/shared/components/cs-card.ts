import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { tokenStyles } from '../styles.js';

@customElement('cs-card')
export class CsCard extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: block;
				margin: 0 0 8px;
				padding: 10px 12px;
				border: 1px solid var(--cs-card-border);
				border-radius: 4px;
				background: var(--cs-card-bg);
			}

			header {
				display: flex;
				align-items: flex-start;
				gap: 8px;
			}

			.title {
				flex: 1;
				font-weight: 600;
				line-height: 1.35;
				overflow-wrap: anywhere;
			}

			.actions {
				display: inline-flex;
				gap: 2px;
				flex-shrink: 0;
			}

			.meta {
				margin-top: 4px;
				color: var(--cs-fg-muted);
				font-size: calc(var(--vscode-font-size) - 1px);
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
				align-items: center;
			}

			::slotted([slot='body']) {
				display: block;
				margin-top: 6px;
				color: var(--cs-fg-muted);
				line-height: 1.4;
				overflow-wrap: anywhere;
			}
		`,
	];

	render() {
		return html`
			<header>
				<div class="title"><slot name="title"></slot></div>
				<div class="actions"><slot name="actions"></slot></div>
			</header>
			<div class="meta"><slot name="meta"></slot></div>
			<slot name="body"></slot>
		`;
	}
}
