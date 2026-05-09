import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { focusRing, tokenStyles, tooltipStyles } from '../styles.js';
import './cs-icon.js';

let nextTooltipId = 0;

@customElement('cs-icon-button')
export class CsIconButton extends LitElement {
	static styles = [
		tokenStyles,
		focusRing,
		tooltipStyles,
		css`
			:host {
				display: inline-flex;
			}

			button {
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

			button:hover:not(:disabled) {
				background: var(--cs-icon-hover-bg);
			}

			button[aria-expanded='true'] {
				background: var(--cs-icon-hover-bg);
			}

			button:disabled {
				opacity: 0.45;
				cursor: default;
			}
		`,
	];

	@property({ type: String }) icon = '';
	@property({ type: String }) label = '';
	@property({ type: Boolean, reflect: true }) disabled = false;
	@property({ type: Boolean, attribute: 'aria-expanded' }) expanded = false;
	@state() private tooltipVisible = false;

	private readonly tooltipId = `cs-icon-button-tooltip-${nextTooltipId++}`;

	connectedCallback(): void {
		super.connectedCallback();
		this.syncHostLabel();
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

	updated(changed: Map<string, unknown>): void {
		if (changed.has('label')) {
			this.syncHostLabel();
		}
	}

	render() {
		return html`
			<button
				type="button"
				aria-label=${this.label}
				aria-describedby=${this.label.length === 0 ? nothing : this.tooltipId}
				aria-expanded=${this.expanded ? 'true' : 'false'}
				?disabled=${this.disabled}
				@click=${this.handleClick}
			>
				<cs-icon icon=${this.icon}></cs-icon>
			</button>
			${this.label.length === 0
				? nothing
				: html`<span id=${this.tooltipId} class="tooltip" role="tooltip" data-open=${this.tooltipVisible ? 'true' : 'false'}>${this.label}</span>`}
		`;
	}

	private readonly showTooltip = (): void => {
		this.tooltipVisible = this.label.length > 0;
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

	private syncHostLabel(): void {
		if (this.label.length === 0) {
			this.removeAttribute('title');
			this.removeAttribute('aria-label');
			return;
		}

		this.removeAttribute('title');
		this.setAttribute('aria-label', this.label);
	}
}
