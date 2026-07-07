import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	DecisionRecord,
	FrontmatterValue,
	getRecordId,
	getRecordTitle,
	listDecisionRecords,
	readDecisionRecord,
	validateDecisionRecord,
} from './dr';
import { decisionRecordDirectory, DecisionRecordStatus, StorePaths } from './store';
import { acceptDomainProposals, DomainVocabulary } from './domains';

export interface CandidateCreateInput {
	readonly title: string;
	readonly domain: string;
	readonly decision?: string | undefined;
	readonly pitfalls?: string | undefined;
	readonly appendix?: string | undefined;
	readonly proposedDomainDescription?: string;
	readonly references: readonly string[];
	readonly author: string;
	readonly created: string;
}

export interface CandidateCreateResult {
	readonly record: DecisionRecord;
	readonly proposedDomains: readonly string[];
}

export interface CandidateMoveResult {
	readonly from: string;
	readonly to: string;
	readonly record: DecisionRecord;
}

export interface CandidateDismissResult {
	readonly from: string;
	readonly id: string;
	readonly title: string;
}

export interface DecisionRecordDeleteResult {
	readonly from: string;
	readonly id: string;
	readonly title: string;
	readonly status: 'rejected' | 'retired';
}

export async function createCandidate(paths: StorePaths, vocabulary: DomainVocabulary, input: CandidateCreateInput): Promise<CandidateCreateResult> {
	const knownDomainNames = new Set(vocabulary.domains.map(domain => domain.name));
	knownDomainNames.add('all');
	const proposedDomains = knownDomainNames.has(input.domain) || vocabulary.domains.length === 0 ? [] : [input.domain];
	const id = await nextRecordId(paths, 'CAND');
	const filePath = path.join(decisionRecordDirectory(paths, 'candidate'), `${id}-${slugify(input.title)}.md`);
	const frontmatter: Record<string, FrontmatterValue> = {
		id,
		title: input.title,
		status: 'candidate',
		domain: input.domain,
		created: input.created,
		created_by: input.author,
	};

	if (proposedDomains.length > 0) {
		frontmatter.proposed_domains = {
			[input.domain]: input.proposedDomainDescription ?? `TODO: describe ${input.domain}.`,
		};
	}

	if (input.references.length > 0) {
		frontmatter.references = input.references;
	}

	const decision = input.decision?.trim();
	const pitfalls = input.pitfalls?.trim();
	if ((decision === undefined || decision.length === 0) && (pitfalls === undefined || pitfalls.length === 0)) {
		throw new Error('Candidate must include a decision, pitfalls, or both.');
	}

	const markdown = [
		renderFrontmatter(frontmatter),
		...(decision === undefined || decision.length === 0
			? []
			: ['', '## Decision', '', decision]),
		...(pitfalls === undefined || pitfalls.length === 0
			? []
			: ['', '## Pitfalls', '', pitfalls]),
		...(input.appendix === undefined
			? []
			: ['', '## Appendix', '', input.appendix]),
		'',
	].join('\n');

	await fs.writeFile(filePath, markdown, 'utf8');

	return {
		record: await readDecisionRecord(filePath, 'candidate'),
		proposedDomains,
	};
}

export async function findCandidate(paths: StorePaths, id: string): Promise<DecisionRecord | undefined> {
	const records = await listDecisionRecords(paths);
	return records.find(record => getRecordId(record) === id);
}

export async function acceptCandidate(paths: StorePaths, vocabulary: DomainVocabulary, id: string, updated: string): Promise<CandidateMoveResult> {
	const candidate = await requireCandidateInFolder(paths, id, 'candidate');
	return acceptCandidateRecord(paths, vocabulary, candidate, updated);
}

export async function promoteDecisionRecord(
	paths: StorePaths,
	vocabulary: DomainVocabulary,
	id: string,
	from: 'rejected' | 'retired',
	updated: string,
): Promise<CandidateMoveResult> {
	const record = await requireRecordInFolder(paths, id, from);
	if (getRecordId(record).startsWith('CAND-') || getString(record, 'kind') === 'dr') {
		return acceptCandidateRecord(paths, vocabulary, record, updated);
	}

	const frontmatter: Record<string, FrontmatterValue> = {
		...record.frontmatter,
		status: 'accepted',
		updated,
		author: getString(record, 'author') || getString(record, 'created_by') || 'agent',
	};
	delete frontmatter.rejection_reason;
	delete frontmatter.retired_by;
	delete frontmatter.retirement_reason;
	delete frontmatter.summary;
	delete frontmatter.guidance;

	const markdown = `${renderFrontmatter(frontmatter)}\n${record.body.trimStart()}`;
	const to = path.join(decisionRecordDirectory(paths, 'accepted'), path.basename(record.filePath));
	await fs.writeFile(to, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
	await fs.unlink(record.filePath);

	const accepted = await readDecisionRecord(to, 'accepted');
	const validation = validateDecisionRecord(accepted, vocabulary);
	if (validation.errors.length > 0) {
		throw new Error(`Promoted DR failed validation: ${validation.errors.join('; ')}`);
	}

	return { from: record.filePath, to, record: accepted };
}

export async function deleteDecisionRecord(
	paths: StorePaths,
	id: string,
	from: 'rejected' | 'retired',
): Promise<DecisionRecordDeleteResult> {
	const record = await requireRecordInFolder(paths, id, from);
	await fs.unlink(record.filePath);

	return {
		from: record.filePath,
		id: getRecordId(record),
		title: getRecordTitle(record),
		status: from,
	};
}

export async function dismissCandidate(paths: StorePaths, id: string): Promise<CandidateDismissResult> {
	const candidate = await requireCandidateInFolder(paths, id, 'candidate');
	await fs.unlink(candidate.filePath);

	return {
		from: candidate.filePath,
		id: getRecordId(candidate),
		title: getRecordTitle(candidate),
	};
}

export async function retireDecisionRecord(paths: StorePaths, id: string, retiredBy: string | undefined): Promise<CandidateMoveResult> {
	const record = await requireRecordInFolder(paths, id, 'accepted');
	const frontmatter: Record<string, FrontmatterValue> = {
		...record.frontmatter,
		status: 'retired',
		...(retiredBy === undefined ? {} : { retired_by: retiredBy }),
	};
	delete frontmatter.summary;
	delete frontmatter.guidance;
	const markdown = `${renderFrontmatter(frontmatter)}\n${record.body.trimStart()}`;
	const to = path.join(decisionRecordDirectory(paths, 'retired'), path.basename(record.filePath));

	await fs.writeFile(to, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
	await fs.unlink(record.filePath);

	return {
		from: record.filePath,
		to,
		record: await readDecisionRecord(to, 'retired'),
	};
}

export async function setDecisionRecordEnabled(paths: StorePaths, id: string, enabled: boolean): Promise<CandidateMoveResult> {
	const record = await requireRecordInFolder(paths, id, 'accepted');
	const frontmatter: Record<string, FrontmatterValue> = {
		...record.frontmatter,
		enabled: enabled ? 'true' : 'false',
	};
	delete frontmatter.summary;
	delete frontmatter.guidance;
	const markdown = `${renderFrontmatter(frontmatter)}\n${record.body.trimStart()}`;

	await fs.writeFile(record.filePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');

	return {
		from: record.filePath,
		to: record.filePath,
		record: await readDecisionRecord(record.filePath, 'accepted'),
	};
}

async function acceptCandidateRecord(paths: StorePaths, vocabulary: DomainVocabulary, candidate: DecisionRecord, updated: string): Promise<CandidateMoveResult> {
	const kind = getString(candidate, 'kind');

	if (kind.length > 0 && kind !== 'dr') {
		throw new Error(`Candidate ${getRecordId(candidate)} is kind "${kind}"; only kind "dr" can be accepted as precedent.`);
	}

	const proposedDomains = getProposalRecord(candidate, 'proposed_domains');
	const acceptedVocabulary = Object.keys(proposedDomains).length === 0
		? vocabulary
		: await acceptDomainProposals(paths.domains, { domains: proposedDomains });

	const nextId = await nextRecordId(paths, 'DR');
	const frontmatter: Record<string, FrontmatterValue> = {
		...candidate.frontmatter,
		id: nextId,
		status: 'accepted',
		updated,
		author: getString(candidate, 'author') || getString(candidate, 'created_by') || 'agent',
	};
	delete frontmatter.kind;
	delete frontmatter.created_by;
	delete frontmatter.tags;
	delete frontmatter.proposed_tags;
	delete frontmatter.proposed_domains;
	delete frontmatter.rejection_reason;
	delete frontmatter.retired_by;
	delete frontmatter.retirement_reason;
	delete frontmatter.summary;
	delete frontmatter.guidance;

	const acceptedMarkdown = `${renderFrontmatter(frontmatter)}\n${candidate.body.trimStart()}`;
	const to = path.join(decisionRecordDirectory(paths, 'accepted'), `${nextId}-${slugify(getRecordTitle(candidate))}.md`);
	await fs.writeFile(to, acceptedMarkdown.endsWith('\n') ? acceptedMarkdown : `${acceptedMarkdown}\n`, 'utf8');
	await fs.unlink(candidate.filePath);

	const record = await readDecisionRecord(to, 'accepted');
	const validation = validateDecisionRecord(record, acceptedVocabulary);
	if (validation.errors.length > 0) {
		throw new Error(`Accepted candidate failed validation: ${validation.errors.join('; ')}`);
	}

	return { from: candidate.filePath, to, record };
}

export async function rejectCandidate(paths: StorePaths, id: string, reason: string | undefined): Promise<CandidateMoveResult> {
	return moveCandidate(paths, id, 'rejected', reason === undefined ? {} : { rejection_reason: reason });
}

export async function retireCandidate(paths: StorePaths, id: string, retiredBy: string | undefined): Promise<CandidateMoveResult> {
	return moveCandidate(paths, id, 'retired', retiredBy === undefined ? {} : { retired_by: retiredBy });
}

export function renderFrontmatter(frontmatter: Record<string, FrontmatterValue>): string {
	const lines = ['---'];

	for (const [key, value] of Object.entries(frontmatter)) {
		if (Array.isArray(value)) {
			lines.push(`${key}:`);
			for (const item of value) {
				lines.push(`  - ${item}`);
			}
			continue;
		}

		if (isStringRecord(value)) {
			lines.push(`${key}:`);
			for (const [nestedKey, nestedValue] of Object.entries(value)) {
				lines.push(`  ${nestedKey}: ${nestedValue}`);
			}
			continue;
		}

		lines.push(`${key}: ${value}`);
	}

	lines.push('---');
	return lines.join('\n');
}

async function moveCandidate(
	paths: StorePaths,
	id: string,
	status: 'rejected' | 'retired',
	frontmatterPatch: Record<string, string>,
): Promise<CandidateMoveResult> {
	const candidate = await requireCandidateInFolder(paths, id, 'candidate');
	const frontmatter: Record<string, FrontmatterValue> = {
		...candidate.frontmatter,
		status,
		...frontmatterPatch,
	};
	delete frontmatter.summary;
	delete frontmatter.guidance;
	const markdown = `${renderFrontmatter(frontmatter)}\n${candidate.body.trimStart()}`;
	const to = path.join(decisionRecordDirectory(paths, status), path.basename(candidate.filePath));

	await fs.writeFile(to, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
	await fs.unlink(candidate.filePath);

	return {
		from: candidate.filePath,
		to,
		record: await readDecisionRecord(to, status),
	};
}

async function requireCandidateInFolder(paths: StorePaths, id: string, folder: 'candidate'): Promise<DecisionRecord> {
	return requireRecordInFolder(paths, id, folder);
}

async function requireRecordInFolder(paths: StorePaths, id: string, folder: DecisionRecordStatus): Promise<DecisionRecord> {
	const records = await listDecisionRecords(paths, folder);
	const candidate = records.find(record => getRecordId(record) === id);

	if (candidate === undefined) {
		throw new Error(`No ${folder} DR found with id "${id}".`);
	}

	return candidate;
}

async function nextRecordId(paths: StorePaths, prefix: 'CAND' | 'DR'): Promise<string> {
	const records = await listDecisionRecords(paths);
	let max = 0;

	for (const record of records) {
		const id = getRecordId(record);
		if (!id.startsWith(`${prefix}-`)) {
			continue;
		}

		const value = Number(id.slice(prefix.length + 1));
		if (Number.isInteger(value)) {
			max = Math.max(max, value);
		}
	}

	return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function getString(record: DecisionRecord, key: string): string {
	const value = record.frontmatter[key];
	return typeof value === 'string' ? value : '';
}

function getProposalRecord(record: DecisionRecord, key: string): Record<string, string> {
	const value = record.frontmatter[key];
	if (isStringRecord(value)) {
		return { ...value };
	}

	if (Array.isArray(value)) {
		return Object.fromEntries(value.map(item => [item, `TODO: describe ${item}.`]));
	}

	return {};
}

function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug.length === 0 ? 'candidate' : slug;
}

function isStringRecord(value: FrontmatterValue | undefined): value is Record<string, string> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
