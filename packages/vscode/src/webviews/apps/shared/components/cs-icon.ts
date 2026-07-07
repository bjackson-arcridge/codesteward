import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const codiconGlyphs: Readonly<Record<string, string>> = {
	add: '\uea60',
	'arrow-up': '\ueaa1',
	archive: '\uea98',
	check: '\ueab2',
	close: '\uea76',
	edit: '\uea73',
	ellipsis: '\uea7c',
	eye: '\uea70',
	'eye-closed': '\ueae7',
	'go-to-file': '\uea94',
	'open-preview': '\ueb28',
	replace: '\ueb3d',
	trash: '\uea81',
};

@customElement('cs-icon')
export class CsIcon extends LitElement {
	static styles = css`
		:host {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 16px;
			height: 16px;
			color: var(--cs-icon-fg, currentColor);
			line-height: 1;
		}

		.codicon {
			font: normal normal normal 16px/1 codicon;
			display: inline-block;
			text-decoration: none;
			text-rendering: auto;
			text-align: center;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
			user-select: none;
		}
	`;

	@property({ type: String }) icon = '';

	render() {
		return html`<span class="codicon" aria-hidden="true">${codiconGlyphs[this.icon] ?? ''}</span>`;
	}
}
