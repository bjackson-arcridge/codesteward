import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { focusRing, tokenStyles, tooltipStyles } from '../styles.js';

let nextTooltipId = 0;

@customElement('cs-button')
export class CsButton extends LitElement {
	static styles = [
		tokenStyles,
		focusRing,
		tooltipStyles,
		css`
			:host {
				display: inline-flex;
			}

			button {
				flex: 1;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 6px;
				padding: 6px 12px;
				border: 1px solid transparent;
				border-radius: 2px;
				background: var(--cs-button-bg);
				color: var(--cs-button-fg);
				font: inherit;
				cursor: pointer;
			}

			button:hover {
				background: var(--cs-button-hover);
			}

			button:disabled {
				opacity: 0.55;
				cursor: default;
			}

			:host([variant='secondary']) button {
				background: var(--cs-button-secondary-bg);
				color: var(--cs-button-secondary-fg);
			}

			:host([variant='secondary']) button:hover {
				background: var(--cs-button-secondary-hover);
			}
		`,
	];

	@property({ type: String, reflect: true }) variant: 'primary' | 'secondary' = 'primary';
	@property({ type: Boolean, reflect: true }) disabled = false;
	@property({ type: String }) type: 'button' | 'submit' = 'button';
	@property({ type: String, attribute: 'title' }) tooltip = '';
	@state() private tooltipVisible = false;

	private readonly tooltipId = `cs-button-tooltip-${nextTooltipId++}`;

	connectedCallback(): void {
		super.connectedCallback();
		this.addEventListener('pointerenter', this.showTooltip);
		this.addEventListener('pointerleave', this.hideTooltip);
		this.addEventListener('focusin', this.showTooltip);
		this.addEventListener('focusout', this.hideTooltip);
	}

	disconnectedCallback(): void {
		this.removeEventListener('pointerenter', this.showTooltip);
		this.removeEventListener('pointerleave', this.hideTooltip);
		this.removeEventListener('focusin', this.showTooltip);
		this.removeEventListener('focusout', this.hideTooltip);
		super.disconnectedCallback();
	}

	render() {
		return html`
			<button
				type=${this.type}
				aria-describedby=${this.tooltip.length === 0 ? nothing : this.tooltipId}
				?disabled=${this.disabled}
				@click=${this.handleClick}
			>
				<slot></slot>
			</button>
			${this.tooltip.length === 0
				? nothing
				: html`<span id=${this.tooltipId} class="tooltip" role="tooltip" data-open=${this.tooltipVisible ? 'true' : 'false'}>${this.tooltip}</span>`}
		`;
	}

	private readonly showTooltip = (): void => {
		this.tooltipVisible = this.tooltip.length > 0;
	};

	private readonly hideTooltip = (): void => {
		this.tooltipVisible = false;
	};

	private readonly handleClick = (event: MouseEvent): void => {
		this.hideTooltip();
		if (this.disabled) {
			event.stopImmediatePropagation();
		}
	};
}
