import { LitElement, css, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import { tokenStyles } from '../styles.js';

@customElement('cs-popover')
export class CsPopover extends LitElement {
	static styles = [
		tokenStyles,
		css`
			:host {
				display: contents;
			}

			.surface {
				position: absolute;
				top: 0;
				left: 0;
				min-width: 160px;
				padding: 4px 0;
				border: 1px solid var(--cs-menu-border);
				border-radius: 4px;
				background: var(--cs-menu-bg);
				color: var(--cs-menu-fg);
				box-shadow: 0 4px 14px rgb(0 0 0 / 35%);
				z-index: 10000;
				visibility: hidden;
			}

			.surface[data-open='true'] {
				visibility: visible;
			}
		`,
	];

	@property({ type: String }) placement: Placement = 'bottom-end';
	@property({ type: Boolean, reflect: true }) open = false;

	@query('.surface') private surface!: HTMLDivElement;

	private cleanupPosition?: () => void;
	private anchor: HTMLElement | null = null;
	private previousFocus: HTMLElement | null = null;
	private documentClickListener?: (event: MouseEvent) => void;
	private keydownListener?: (event: KeyboardEvent) => void;

	render() {
		return html`
			<slot name="anchor" @click=${this.handleAnchorClick}></slot>
			<div class="surface" role="menu" tabindex="-1" data-open=${this.open ? 'true' : 'false'}>
				<slot></slot>
			</div>
		`;
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this.teardown();
	}

	updated(changed: Map<string, unknown>): void {
		if (changed.has('open')) {
			if (this.open) {
				this.activate();
			} else {
				this.teardown();
			}
		}
	}

	openMenu(): void {
		this.open = true;
	}

	openFor(anchor: HTMLElement, restoreFocus = true): void {
		this.anchor = anchor;
		this.previousFocus = restoreFocus ? ((document.activeElement as HTMLElement | null) ?? anchor) : null;
		this.openMenu();
	}

	closeMenu(restoreFocus = true): void {
		const previous = this.previousFocus;
		this.open = false;
		if (restoreFocus && previous !== null) {
			previous.focus();
		}
	}

	private handleAnchorClick = (event: MouseEvent): void => {
		event.stopPropagation();
		const target = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.matches('[slot="anchor"], [slot="anchor"] *')) ?? null;
		this.anchor = target ?? this.findAnchor();
		if (this.open) {
			this.closeMenu();
			return;
		}

		this.previousFocus = (document.activeElement as HTMLElement | null) ?? this.anchor;
		this.openMenu();
	};

	private findAnchor(): HTMLElement | null {
		const slot = this.shadowRoot?.querySelector('slot[name="anchor"]') as HTMLSlotElement | null;
		const node = slot?.assignedElements({ flatten: true })[0];
		return node instanceof HTMLElement ? node : null;
	}

	private activate(): void {
		const anchor = this.anchor ?? this.findAnchor();
		if (anchor === null) {
			return;
		}

		this.cleanupPosition = autoUpdate(anchor, this.surface, () => {
			void computePosition(anchor, this.surface, {
				placement: this.placement,
				middleware: [offset(4), flip(), shift({ padding: 8 })],
			}).then(({ x, y }) => {
				this.surface.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
			});
		});

		this.documentClickListener = (event: MouseEvent) => {
			const path = event.composedPath();
			if (path.includes(this.surface) || (this.anchor !== null && path.includes(this.anchor))) {
				return;
			}

			this.closeMenu(false);
		};

		this.keydownListener = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				this.closeMenu();
			}
		};

		document.addEventListener('mousedown', this.documentClickListener, true);
		document.addEventListener('keydown', this.keydownListener, true);
		queueMicrotask(() => this.focusFirstItem());
	}

	private focusFirstItem(): void {
		const items = this.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
		items[0]?.focus();
	}

	private teardown(): void {
		this.cleanupPosition?.();
		this.cleanupPosition = undefined;
		if (this.documentClickListener !== undefined) {
			document.removeEventListener('mousedown', this.documentClickListener, true);
			this.documentClickListener = undefined;
		}

		if (this.keydownListener !== undefined) {
			document.removeEventListener('keydown', this.keydownListener, true);
			this.keydownListener = undefined;
		}
	}
}
