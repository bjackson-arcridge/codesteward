import * as vscode from 'vscode';
import {
	type DomainsCliJson,
	type HostToWebview,
	type WebviewToHost,
	type DomainWorkspace,
	isWebviewToHost,
} from './messages';

export interface DomainsServices {
	readonly listWorkspaces: () => Promise<readonly DomainWorkspace[]>;
	readonly load: (root: string) => Promise<DomainsCliJson>;
	readonly mutate: (root: string, args: readonly string[]) => Promise<void>;
	readonly onMutation: () => void | Promise<void>;
	readonly diagnosticsEnabled?: () => boolean;
	readonly onRendered?: (message: Extract<WebviewToHost, { kind: 'rendered' }>) => void;
}

export class DomainsWebviewProvider {
	private readonly emitter = new vscode.EventEmitter<HostToWebview>();
	readonly onDidPostMessage = this.emitter.event;
	private selectedWorkspace?: string;
	private busy = false;
	private error?: string;

	constructor(private readonly services: DomainsServices) {}

	async refresh(): Promise<void> {
		this.post(await this.getState());
	}

	getState(): Promise<HostToWebview> {
		return this.buildState();
	}

	async handleMessage(message: WebviewToHost): Promise<void> {
		switch (message.kind) {
			case 'selectWorkspace':
				await this.selectWorkspace(message.root);
				return;
			case 'add':
				await this.runMutation(['domains', 'add', '--name', message.name, '--description', message.description]);
				return;
			case 'update': {
				const args = ['domains', 'update', message.currentName];
				if (message.name !== undefined) {
					args.push('--name', message.name);
				}
				if (message.description !== undefined) {
					args.push('--description', message.description);
				}
				await this.runMutation(args);
				return;
			}
			case 'remove':
				await this.runMutation(['domains', 'remove', message.name]);
				return;
			case 'requestRefresh':
				await this.refresh();
				return;
			case 'rendered':
				this.services.onRendered?.(message);
				return;
		}
	}

	private async selectWorkspace(root: string): Promise<void> {
		const workspaces = await this.services.listWorkspaces();
		if (!workspaces.some(workspace => workspace.root === root)) {
			this.error = 'The selected Sundial workspace is no longer available.';
		} else {
			this.selectedWorkspace = root;
			this.error = undefined;
		}
		await this.refresh();
	}

	private async runMutation(args: readonly string[]): Promise<void> {
		const state = await this.buildState();
		if (state.selectedWorkspace === undefined) {
			this.error = 'No initialized Sundial workspace is available.';
			await this.refresh();
			return;
		}
		this.busy = true;
		this.error = undefined;
		this.post(await this.buildState());
		try {
			await this.services.mutate(state.selectedWorkspace, args);
			await this.services.onMutation();
		} catch (error) {
			this.error = commandErrorMessage(error);
		} finally {
			this.busy = false;
			this.post(await this.buildState());
		}
	}

	private async buildState(): Promise<HostToWebview> {
		const workspaces = await this.services.listWorkspaces();
		if (this.selectedWorkspace === undefined || !workspaces.some(workspace => workspace.root === this.selectedWorkspace)) {
			this.selectedWorkspace = workspaces[0]?.root;
		}
		let data: DomainsCliJson = { version: 1, domains: [], suggestions: [] };
		if (this.selectedWorkspace !== undefined) {
			try {
				data = await this.services.load(this.selectedWorkspace);
			} catch (error) {
				this.error = commandErrorMessage(error);
			}
		}
		return {
			kind: 'state',
			workspaces,
			...(this.selectedWorkspace === undefined ? {} : { selectedWorkspace: this.selectedWorkspace }),
			domains: data.domains,
			suggestions: data.suggestions,
			busy: this.busy,
			...(this.error === undefined ? {} : { error: this.error }),
			...(this.services.diagnosticsEnabled?.() === true ? { diagnosticsEnabled: true } : {}),
		};
	}

	private post(message: HostToWebview): void {
		this.emitter.fire(message);
	}
}

function commandErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const commandError = error as Error & { readonly stderr?: string | Buffer; readonly stdout?: string | Buffer };
		return commandError.stderr?.toString().trim()
			|| commandError.stdout?.toString().trim()
			|| error.message;
	}
	return String(error);
}

export { isWebviewToHost };
