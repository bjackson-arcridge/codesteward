import { css } from 'lit';

export const tokenStyles = css`
	:host {
		--cs-fg: var(--vscode-foreground);
		--cs-fg-muted: var(--vscode-descriptionForeground);
		--cs-bg: var(--vscode-sideBar-background);
		--cs-card-bg: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--vscode-foreground) 8%);
		--cs-card-border: var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border, transparent));
		--cs-focus: var(--vscode-focusBorder);
		--cs-button-bg: var(--vscode-button-background);
		--cs-button-fg: var(--vscode-button-foreground);
		--cs-button-hover: var(--vscode-button-hoverBackground);
		--cs-button-secondary-bg: var(--vscode-button-secondaryBackground);
		--cs-button-secondary-fg: var(--vscode-button-secondaryForeground);
		--cs-button-secondary-hover: var(--vscode-button-secondaryHoverBackground);
		--cs-icon-fg: var(--vscode-icon-foreground);
		--cs-icon-hover-bg: var(--vscode-toolbar-hoverBackground);
		--cs-menu-bg: var(--vscode-menu-background);
		--cs-menu-fg: var(--vscode-menu-foreground);
		--cs-menu-border: var(--vscode-menu-border, var(--vscode-widget-border, transparent));
		--cs-menu-selection-bg: var(--vscode-menu-selectionBackground);
		--cs-menu-selection-fg: var(--vscode-menu-selectionForeground);
		--cs-badge-bg: var(--vscode-badge-background);
		--cs-badge-fg: var(--vscode-badge-foreground);
		--cs-badge-inverse-bg: var(--vscode-foreground);
		--cs-badge-inverse-fg: var(--vscode-sideBar-background);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		color: var(--cs-fg);
	}
`;

export const focusRing = css`
	:focus-visible {
		outline: 1px solid var(--cs-focus);
		outline-offset: 2px;
	}
`;

export const tooltipStyles = css`
	:host {
		position: relative;
	}

	.tooltip {
		position: absolute;
		right: 0;
		bottom: calc(100% + 4px);
		z-index: 10000;
		width: max-content;
		max-width: min(240px, calc(100vw - 16px));
		padding: 3px 6px;
		border: 1px solid var(--cs-menu-border);
		border-radius: 2px;
		background: var(--cs-menu-bg);
		color: var(--cs-menu-fg);
		font-size: calc(var(--vscode-font-size) - 1px);
		line-height: 1.3;
		text-align: left;
		overflow-wrap: anywhere;
		pointer-events: none;
		visibility: hidden;
		opacity: 0;
	}

	.tooltip[data-open='true'] {
		visibility: visible;
		opacity: 1;
	}
`;
