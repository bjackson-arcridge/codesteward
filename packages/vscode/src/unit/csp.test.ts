import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { generateNonce } from '../webviews/shared/csp';

describe('generateNonce', () => {
	test('returns a 32-character alphanumeric string', () => {
		const nonce = generateNonce();
		assert.equal(nonce.length, 32);
		assert.match(nonce, /^[A-Za-z0-9]{32}$/);
	});

	test('returns a different value on each call', () => {
		const nonces = new Set<string>();
		for (let index = 0; index < 64; index += 1) {
			nonces.add(generateNonce());
		}

		assert.equal(nonces.size, 64);
	});
});
