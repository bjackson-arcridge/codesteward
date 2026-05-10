import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { sundialCliCommand, sundialCliInstallArgs, sundialCliNpmPackage } from '../sundialCli';

describe('Sundial CLI configuration', () => {
	test('uses the renamed binary and scoped npm package', () => {
		assert.equal(sundialCliCommand, 'sundial');
		assert.equal(sundialCliNpmPackage, '@arcridge/sundial');
		assert.deepEqual(sundialCliInstallArgs(), ['install', '-g', '@arcridge/sundial']);
	});
});
