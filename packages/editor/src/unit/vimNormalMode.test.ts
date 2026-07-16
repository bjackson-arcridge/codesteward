import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	returnToVscodeVimNormalMode,
	vscodeVimEscapeCommandId,
	vscodeVimExtensionId,
} from '../vimNormalMode';

describe('returnToVscodeVimNormalMode', () => {
	test('does nothing when VSCodeVim is not installed', async () => {
		const commands: string[] = [];

		const changedMode = await returnToVscodeVimNormalMode({
			getExtension: extensionId => {
				assert.equal(extensionId, vscodeVimExtensionId);
				return undefined;
			},
			executeCommand: async commandId => { commands.push(commandId); },
		});

		assert.equal(changedMode, false);
		assert.deepEqual(commands, []);
	});

	test('activates VSCodeVim when needed before returning it to Normal mode', async () => {
		const events: string[] = [];

		const changedMode = await returnToVscodeVimNormalMode({
			getExtension: () => ({
				isActive: false,
				activate: async () => { events.push('activate'); },
			}),
			executeCommand: async commandId => { events.push(commandId); },
		});

		assert.equal(changedMode, true);
		assert.deepEqual(events, ['activate', vscodeVimEscapeCommandId]);
	});

	test('uses the active VSCodeVim instance without activating it again', async () => {
		let activationCount = 0;
		const commands: string[] = [];

		const changedMode = await returnToVscodeVimNormalMode({
			getExtension: () => ({
				isActive: true,
				activate: async () => { activationCount += 1; },
			}),
			executeCommand: async commandId => { commands.push(commandId); },
		});

		assert.equal(changedMode, true);
		assert.equal(activationCount, 0);
		assert.deepEqual(commands, [vscodeVimEscapeCommandId]);
	});

	test('keeps focus restoration successful when VSCodeVim mode switching fails', async () => {
		const failures: unknown[] = [];
		const expectedError = new Error('escape command unavailable');

		const changedMode = await returnToVscodeVimNormalMode({
			getExtension: () => ({
				isActive: true,
				activate: async () => undefined,
			}),
			executeCommand: async () => { throw expectedError; },
			reportFailure: error => { failures.push(error); },
		});

		assert.equal(changedMode, false);
		assert.deepEqual(failures, [expectedError]);
	});
});
