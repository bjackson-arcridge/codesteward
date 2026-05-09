import { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { decisionRecordDirectory, decisionRecordStatuses, DecisionRecordStatus, StorePaths } from './store';
import { TagVocabulary } from './tags';

export interface DecisionRecord {
	readonly filePath: string;
	readonly expectedStatus: DecisionRecordStatus | undefined;
	readonly markdown: string;
	readonly frontmatter: Record<string, FrontmatterValue>;
	readonly body: string;
	readonly sections: ReadonlyMap<string, string>;
}

export type FrontmatterValue = string | readonly string[] | Record<string, string>;

export interface ValidationResult {
	readonly path: string;
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
}

const statusValues = new Set<string>(decisionRecordStatuses);
const drIdPattern = /^DR-\d{4}$/;
const candidateIdPattern = /^CAND-\d{4}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const domainPattern = /^(?:all|[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)$/;

export async function readDecisionRecord(filePath: string, expectedStatus?: DecisionRecordStatus): Promise<DecisionRecord> {
	const markdown = await fs.readFile(filePath, 'utf8');
	return parseDecisionRecord(markdown, filePath, expectedStatus);
}

export function parseDecisionRecord(markdown: string, filePath: string, expectedStatus?: DecisionRecordStatus): DecisionRecord {
	const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown);

	if (frontmatterMatch === null) {
		return {
			filePath,
			expectedStatus,
			markdown,
			frontmatter: {},
			body: markdown,
			sections: parseSections(markdown),
		};
	}

	const [, frontmatterText, body] = frontmatterMatch;
	return {
		filePath,
		expectedStatus,
		markdown,
		frontmatter: parseFrontmatter(frontmatterText),
		body,
		sections: parseSections(body),
	};
}

export async function listDecisionRecords(paths: StorePaths, status?: DecisionRecordStatus): Promise<readonly DecisionRecord[]> {
	const statuses = status === undefined ? decisionRecordStatuses : [status];
	const records: DecisionRecord[] = [];

	for (const item of statuses) {
		const directory = decisionRecordDirectory(paths, item);
		const entries = await safeReadDirectory(directory);

		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
				continue;
			}

			records.push(await readDecisionRecord(path.join(directory, entry.name), item));
		}
	}

	return records.sort((left, right) => getRequiredString(left, 'id').localeCompare(getRequiredString(right, 'id')));
}

export function validateDecisionRecord(record: DecisionRecord, vocabulary: TagVocabulary): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const frontmatter = record.frontmatter;
	const status = getRequiredString(record, 'status');

	for (const field of ['id', 'title', 'status', 'created'] as const) {
		if (!hasFrontmatterValue(frontmatter, field)) {
			errors.push(`Missing required field "${field}".`);
		}
	}

	if (status.length > 0 && !statusValues.has(status)) {
		errors.push(`Invalid status "${status}".`);
	}

	if (record.expectedStatus !== undefined && status.length > 0 && record.expectedStatus !== status) {
		errors.push(`Status "${status}" does not match ${record.expectedStatus} folder.`);
	}

	validateId(record, errors);
	validateDate(record, 'created', errors);
	validateDate(record, 'updated', errors);
	validateBoolean(record, 'enabled', errors);
	validateDomain(record, vocabulary, errors, warnings);
	validateTags(record, vocabulary, errors, warnings);
	validateRemovedRetrievalFields(record, errors);

	if (status === 'accepted') {
		for (const field of ['updated', 'author'] as const) {
			if (!hasFrontmatterValue(frontmatter, field)) {
				errors.push(`Missing required accepted-DR field "${field}".`);
			}
		}

		if (!record.sections.has('decision')) {
			errors.push('Missing required "## Decision" section.');
		}
	}

	return {
		path: record.filePath,
		errors,
		warnings,
	};
}

export function getRecordTags(record: DecisionRecord): readonly string[] {
	return getStringList(record, 'tags');
}

export function getRecordId(record: DecisionRecord): string {
	return getRequiredString(record, 'id');
}

export function getRecordTitle(record: DecisionRecord): string {
	return getRequiredString(record, 'title');
}

export function getRecordStatus(record: DecisionRecord): string {
	return getRequiredString(record, 'status');
}

export function getRecordEnabled(record: DecisionRecord): boolean {
	return getOptionalString(record, 'enabled') !== 'false';
}

export function getRecordDomain(record: DecisionRecord): string {
	return getOptionalString(record, 'domain') ?? 'all';
}

export function getRecordReferences(record: DecisionRecord): readonly string[] {
	return getStringList(record, 'references');
}

export function getRecordSection(record: DecisionRecord, title: string): string | undefined {
	return record.sections.get(sectionKey(title));
}

export function getRecordDecision(record: DecisionRecord): string {
	return getRecordSection(record, 'Decision') ?? '';
}

export function isValidRecordDomain(domain: string): boolean {
	return domainPattern.test(domain);
}

function parseFrontmatter(frontmatter: string): Record<string, FrontmatterValue> {
	const result: Record<string, FrontmatterValue> = {};
	const lines = frontmatter.split(/\r?\n/);
	let currentListKey: string | undefined;
	let currentObjectKey: string | undefined;

	for (const line of lines) {
		const listItem = /^\s*-\s*(.*?)\s*$/.exec(line);
		if (listItem !== null && currentListKey !== undefined) {
			const value = listItem[1];
			result[currentListKey] = [...asStringList(result[currentListKey]), unquote(value)];
			continue;
		}

		const objectProperty = /^\s+([A-Za-z0-9_.-]+):\s*(.*?)\s*$/.exec(line);
		if (objectProperty !== null && currentObjectKey !== undefined) {
			const [, property, value] = objectProperty;
			result[currentObjectKey] = {
				...asStringRecord(result[currentObjectKey]),
				[property]: unquote(value),
			};
			continue;
		}

		const keyValue = /^([A-Za-z0-9_-]+):(?:\s*(.*?))?\s*$/.exec(line);
		if (keyValue === null) {
			currentListKey = undefined;
			currentObjectKey = undefined;
			continue;
		}

		const [, key, rawValue = ''] = keyValue;
		const value = rawValue.trim();

		if (value.length === 0) {
			result[key] = [];
			currentListKey = key;
			currentObjectKey = key;
		} else {
			result[key] = unquote(value);
			currentListKey = undefined;
			currentObjectKey = undefined;
		}
	}

	return result;
}

function parseSections(markdown: string): ReadonlyMap<string, string> {
	const sections = new Map<string, string>();
	const lines = markdown.split(/\r?\n/);
	let currentTitle: string | undefined;
	let currentLines: string[] = [];

	for (const line of lines) {
		const heading = /^##\s+(.+?)\s*$/.exec(line);

		if (heading !== null) {
			if (currentTitle !== undefined) {
				sections.set(sectionKey(currentTitle), currentLines.join('\n').trim());
			}

			currentTitle = heading[1];
			currentLines = [];
			continue;
		}

		if (currentTitle !== undefined) {
			currentLines.push(line);
		}
	}

	if (currentTitle !== undefined) {
		sections.set(sectionKey(currentTitle), currentLines.join('\n').trim());
	}

	return sections;
}

async function safeReadDirectory(directory: string): Promise<readonly Dirent[]> {
	try {
		return await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}
}

function validateId(record: DecisionRecord, errors: string[]): void {
	const id = getRequiredString(record, 'id');
	const status = getRequiredString(record, 'status');

	if (id.length === 0) {
		return;
	}

	const allowed = status === 'candidate'
		? candidateIdPattern
		: status === 'accepted'
			? drIdPattern
			: /^(?:DR|CAND)-\d{4}$/;

	if (!allowed.test(id)) {
		errors.push(`Invalid id "${id}" for status "${status}".`);
	}

	if (!path.basename(record.filePath).startsWith(id)) {
		errors.push(`Filename must start with id "${id}".`);
	}
}

function validateDate(record: DecisionRecord, field: string, errors: string[]): void {
	const value = getOptionalString(record, field);
	if (value !== undefined && !isoDatePattern.test(value)) {
		errors.push(`Field "${field}" must use YYYY-MM-DD.`);
	}
}

function validateBoolean(record: DecisionRecord, field: string, errors: string[]): void {
	const value = getOptionalString(record, field);
	if (value !== undefined && value !== 'true' && value !== 'false') {
		errors.push(`Field "${field}" must be true or false.`);
	}
}

function validateDomain(record: DecisionRecord, vocabulary: TagVocabulary, errors: string[], warnings: string[]): void {
	if (Object.prototype.hasOwnProperty.call(record.frontmatter, 'dimension')) {
		errors.push('Field "dimension" is no longer supported; use "domain".');
	}

	if (!Object.prototype.hasOwnProperty.call(record.frontmatter, 'domain')) {
		return;
	}

	const value = record.frontmatter.domain;
	if (typeof value !== 'string' || value.length === 0) {
		errors.push('Field "domain" must be a non-empty string.');
		return;
	}

	if (!isValidRecordDomain(value)) {
		errors.push('Field "domain" must be "all" or a lowercase dot-separated kebab-case path.');
		return;
	}

	if (vocabulary.domains.length === 0) {
		return;
	}

	const status = getRequiredString(record, 'status');
	const knownDomains = new Set(vocabulary.domains.map(domain => domain.name));
	knownDomains.add('all');
	if (!knownDomains.has(value)) {
		const message = `Unknown domain "${value}".`;
		if (status === 'candidate') {
			warnings.push(message);
		} else {
			errors.push(message);
		}
	}
}

function validateTags(record: DecisionRecord, vocabulary: TagVocabulary, errors: string[], warnings: string[]): void {
	const tags = getStringList(record, 'tags');
	const status = getRequiredString(record, 'status');
	const knownTags = new Set(vocabulary.tags.map(tag => tag.name));

	for (const tag of tags) {
		if (!knownTags.has(tag)) {
			const message = `Unknown tag "${tag}".`;
			if (status === 'candidate') {
				warnings.push(message);
			} else {
				errors.push(message);
			}
		}
	}
}

function validateRemovedRetrievalFields(record: DecisionRecord, errors: string[]): void {
	if (Object.prototype.hasOwnProperty.call(record.frontmatter, 'summary')) {
		errors.push('Field "summary" is no longer supported; short detail uses "title".');
	}

	if (Object.prototype.hasOwnProperty.call(record.frontmatter, 'guidance')) {
		errors.push('Field "guidance" is no longer supported; medium detail uses "## Decision".');
	}
}

function getRequiredString(record: DecisionRecord, key: string): string {
	return getOptionalString(record, key) ?? '';
}

function getOptionalString(record: DecisionRecord, key: string): string | undefined {
	const value = record.frontmatter[key];
	return typeof value === 'string' ? value : undefined;
}

function getStringList(record: DecisionRecord, key: string): readonly string[] {
	return asStringList(record.frontmatter[key]);
}

function hasFrontmatterValue(frontmatter: Record<string, FrontmatterValue>, key: string): boolean {
	const value = frontmatter[key];
	if (value === undefined) {
		return false;
	}

	if (typeof value === 'string') {
		return value.trim().length > 0;
	}

	if (Array.isArray(value)) {
		return value.length > 0;
	}

	return Object.keys(value).length > 0;
}

function asStringList(value: FrontmatterValue | undefined): readonly string[] {
	return Array.isArray(value) ? value.filter(item => item.length > 0) : [];
}

function asStringRecord(value: FrontmatterValue | undefined): Record<string, string> {
	return isStringRecord(value) ? value : {};
}

function isStringRecord(value: FrontmatterValue | undefined): value is Record<string, string> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sectionKey(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, '-');
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}
