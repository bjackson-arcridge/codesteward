import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getRecordReferences, listDecisionRecords, validateDecisionRecord, ValidationResult } from './dr';
import { StorePaths } from './store';
import { readDomainVocabulary } from './domains';

export interface StoreValidationResult {
	readonly validationResults: readonly ValidationResult[];
	readonly vocabularyErrors: readonly string[];
}

export async function validateStore(paths: StorePaths): Promise<StoreValidationResult> {
	const vocabulary = await readDomainVocabulary(paths.domains);
	const records = await listDecisionRecords(paths);
	const validationResults = await Promise.all(records.map(async record => {
		const validation = validateDecisionRecord(record, vocabulary);
		const referenceWarnings = await brokenReferenceWarnings(paths, record);

		return {
			...validation,
			warnings: [...validation.warnings, ...referenceWarnings],
		};
	}));

	return {
		validationResults,
		vocabularyErrors: vocabulary.errors,
	};
}

async function brokenReferenceWarnings(paths: StorePaths, record: Awaited<ReturnType<typeof listDecisionRecords>>[number]): Promise<readonly string[]> {
	const warnings: string[] = [];

	for (const reference of getRecordReferences(record)) {
		if (reference.includes('://')) {
			continue;
		}

		const filePart = reference.split('#')[0];
		if (filePart.length === 0) {
			continue;
		}

		try {
			await fs.access(path.resolve(paths.root, filePart));
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				warnings.push(`Reference target does not exist: ${reference}`);
				continue;
			}

			throw error;
		}
	}

	return warnings;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}

export function validationErrorCount(result: StoreValidationResult): number {
	return result.vocabularyErrors.length + result.validationResults.reduce((sum, item) => sum + item.errors.length, 0);
}

export function validationWarningCount(result: StoreValidationResult): number {
	return result.validationResults.reduce((sum, item) => sum + item.warnings.length, 0);
}
