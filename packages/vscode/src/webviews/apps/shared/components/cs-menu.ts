import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('cs-menu')
export class CsMenu extends LitElement {
	connectedCallback(): void {
		super.connectedCallback();
		this.role = 'group';
		this.addEventListener('keydown', this.handleKeydown);
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this.removeEventListener('keydown', this.handleKeydown);
	}

	render() {
		return html`<slot></slot>`;
	}

	private handleKeydown = (event: KeyboardEvent): void => {
		const items = this.items();
		if (items.length === 0) {
			return;
		}

		const active = (this.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;
		const currentIndex = active === null ? -1 : items.indexOf(active);

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			items[(currentIndex + 1 + items.length) % items.length].focus();
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			items[(currentIndex - 1 + items.length) % items.length].focus();
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			items[0].focus();
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			items[items.length - 1].focus();
		}
	};

	private items(): HTMLElement[] {
		return Array.from(this.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
	}
}
