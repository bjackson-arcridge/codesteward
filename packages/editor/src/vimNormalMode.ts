export const vscodeVimExtensionId = 'vscodevim.vim';
export const vscodeVimEscapeCommandId = 'extension.vim_escape';

export interface VscodeVimExtension {
	readonly isActive: boolean;
	activate(): PromiseLike<unknown>;
}

export interface VimNormalModeServices {
	readonly getExtension: (extensionId: string) => VscodeVimExtension | undefined;
	readonly executeCommand: (commandId: string) => PromiseLike<unknown>;
	readonly reportFailure?: (error: unknown) => void;
}

export async function returnToVscodeVimNormalMode(services: VimNormalModeServices): Promise<boolean> {
	const extension = services.getExtension(vscodeVimExtensionId);
	if (extension === undefined) {
		return false;
	}

	try {
		if (!extension.isActive) {
			await extension.activate();
		}
		await services.executeCommand(vscodeVimEscapeCommandId);
		return true;
	} catch (error) {
		services.reportFailure?.(error);
		return false;
	}
}
