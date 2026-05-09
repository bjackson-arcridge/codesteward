import * as vscode from 'vscode';

export interface MessageRouter<Inbound, Outbound> {
	readonly post: (message: Outbound) => void;
	readonly dispose: () => void;
}

export function attachMessageRouter<Inbound, Outbound>(
	webview: vscode.Webview,
	guard: (value: unknown) => value is Inbound,
	handle: (message: Inbound) => void | Promise<void>,
): MessageRouter<Inbound, Outbound> {
	const subscription = webview.onDidReceiveMessage((raw: unknown) => {
		if (!guard(raw)) {
			console.warn('codesteward: dropped malformed webview message', raw);
			return;
		}

		void handle(raw);
	});

	return {
		post: (message: Outbound) => {
			void webview.postMessage(message);
		},
		dispose: () => subscription.dispose(),
	};
}
