interface VsCodeApi<Outbound, State = unknown> {
	postMessage(message: Outbound): void;
	getState(): State | undefined;
	setState(state: State): void;
}

declare function acquireVsCodeApi<Outbound, State>(): VsCodeApi<Outbound, State>;

let cachedApi: VsCodeApi<unknown, unknown> | undefined;
const defaultRefreshIntervalMs = 30000;

export function getHost<Outbound, State = unknown>(): VsCodeApi<Outbound, State> {
	cachedApi ??= acquireVsCodeApi();
	return cachedApi as VsCodeApi<Outbound, State>;
}

export function readInitialState<T>(): T | undefined {
	const node = document.getElementById('cs-initial-state');
	if (node === null || node.textContent === null) {
		return undefined;
	}

	try {
		return JSON.parse(node.textContent) as T;
	} catch {
		return undefined;
	}
}

export function connectRefreshTriggers(sendRefresh: () => void, intervalMs = defaultRefreshIntervalMs): () => void {
	const requestVisibleRefresh = (): void => {
		if (document.visibilityState !== 'hidden') {
			sendRefresh();
		}
	};
	const requestRefreshOnVisibility = (): void => {
		if (document.visibilityState === 'visible') {
			sendRefresh();
		}
	};
	const initialRefresh = window.setTimeout(sendRefresh, 0);
	const interval = window.setInterval(requestVisibleRefresh, intervalMs);

	document.addEventListener('visibilitychange', requestRefreshOnVisibility);
	window.addEventListener('focus', requestVisibleRefresh);

	return () => {
		window.clearTimeout(initialRefresh);
		window.clearInterval(interval);
		document.removeEventListener('visibilitychange', requestRefreshOnVisibility);
		window.removeEventListener('focus', requestVisibleRefresh);
	};
}
