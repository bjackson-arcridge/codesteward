import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	acceptCandidate,
	createCandidate,
	deleteDecisionRecord,
	findCandidate,
	promoteDecisionRecord,
	rejectCandidate,
	retireDecisionRecord,
	retireCandidate,
	setDecisionRecordEnabled,
} from './core/candidates';
import { validateStore, validationErrorCount, validationWarningCount } from './core/validation';
import {
	DecisionRecord,
	getRecordDecision,
	getRecordDomain,
	getRecordEnabled,
	getRecordId,
	getRecordReferences,
	getRecordSection,
	getRecordStatus,
	getRecordTags,
	getRecordTitle,
	isValidRecordDomain,
	listDecisionRecords,
	ValidationResult,
} from './core/dr';
import { readTagVocabulary, type DomainDefinition, type TagDefinition } from './core/tags';
import {
	countDecisionRecords,
	decisionRecordDirectory,
	decisionRecordStatuses,
	DecisionRecordStatus,
	discoverStore,
	getStorePaths,
	initStore,
	pathExists,
	StorePaths,
	updateRuntimeAssets,
} from './core/store';

interface CliOptions {
	readonly cwd: string;
	readonly quiet: boolean;
	readonly noSessionLog: boolean;
	readonly command: readonly string[];
}

const usage = `Sundial CLI

Usage:
  sundial [--cwd <path>] [--quiet] [--no-session-log] <command>

Commands:
  init        Create or update the project-local .sundial store at an explicit root
  update      Update installed skill files for the discovered or explicit project root
  status      Report store health, counts, and validation state
  bootstrap   Run an LLM-backed bootstrap that creates candidates via the CLI
  tags        List known domains and tags from .sundial/tags.md
  dr retrieve Retrieve visible accepted DRs by domain and optional tag
  dr get      Cat DR markdown files by id
  dr list     List DRs by status or tag
  dr enable   Include an accepted DR in retrieval results
  dr disable  Suppress an accepted DR from retrieval results
  dr retire   Move an accepted DR to retired history
  dr promote  Move a rejected or retired DR back to accepted precedent
  dr delete   Remove a rejected or retired DR file from disk
  candidate   Create, list, show, accept, reject, or retire candidates
  help        Show this help
`;

type DetailLevel = 'short' | 'medium' | 'full';
interface RecordRenderOptions {
	readonly showStatus: boolean;
	readonly showEnabled: boolean;
	readonly showPath: boolean;
}

const defaultRecordRenderOptions: RecordRenderOptions = {
	showStatus: true,
	showEnabled: true,
	showPath: true,
};
const retrieveRecordRenderOptions: RecordRenderOptions = {
	showStatus: false,
	showEnabled: false,
	showPath: false,
};

export async function main(argv: readonly string[], io: Pick<NodeJS.Process, 'cwd' | 'stdout' | 'stderr' | 'exitCode'>): Promise<void> {
	const parsed = parseArguments(argv, io.cwd());

	if (parsed.command.length === 0 || parsed.command[0] === 'help' || parsed.command[0] === '--help') {
		write(io.stdout, usage);
		return;
	}

	const [command, ...commandArgs] = parsed.command;

	if (command === 'init') {
		await runInit(parsed, commandArgs, io);
		return;
	}

	if (command === 'tags') {
		await runTags(parsed, commandArgs, io);
		return;
	}

	if (command === 'status') {
		await runStatus(parsed, commandArgs, io);
		return;
	}

	if (command === 'update') {
		await runUpdate(parsed, commandArgs, io);
		return;
	}

	if (command === 'bootstrap') {
		await runBootstrap(parsed, commandArgs, io);
		return;
	}

	if (command === 'dr') {
		await runDr(parsed, commandArgs, io);
		return;
	}

	if (command === 'candidate') {
		await runCandidate(parsed, commandArgs, io);
		return;
	}

	write(io.stderr, `Unknown command: ${command}\n\n${usage}`);
	io.exitCode = 64;
}

export type BootstrapProvider = 'claude' | 'codex';
interface BootstrapCommand {
	readonly file: string;
	readonly args: readonly string[];
}
interface BootstrapOutput {
	readonly stdout: Pick<NodeJS.WritableStream, 'write'>;
	readonly stderr: Pick<NodeJS.WritableStream, 'write'>;
}

async function runBootstrap(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseBootstrapArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const prompt = bootstrapPrompt(paths);
	const command = bootstrapCommand(parsed.provider, paths.root, prompt);

	try {
		if (!options.quiet) {
			write(io.stdout, `Starting bootstrap with ${parsed.provider}: ${formatBootstrapCommand(command)}\n`);
		}

		await runBootstrapCommand(command, paths.root, options.quiet ? undefined : io);

		if (!options.quiet) {
			write(io.stdout, `Bootstrap completed with ${parsed.provider}.\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runCandidate(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const [subcommand, ...subcommandArgs] = args;

	if (subcommand === 'create') {
		await runCandidateCreate(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'list') {
		await runCandidateList(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'show') {
		await runCandidateShow(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'accept') {
		await runCandidateAccept(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'reject') {
		await runCandidateReject(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'retire') {
		await runCandidateRetire(options, subcommandArgs, io);
		return;
	}

	write(io.stderr, 'Usage: sundial candidate (create | list | show | accept | reject | retire)\n');
	io.exitCode = 64;
}

async function runCandidateCreate(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseCandidateCreateArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const vocabulary = await readTagVocabulary(paths.tags);
	const result = await createCandidate(paths, vocabulary, {
		...parsed,
		author: defaultAuthor(),
		created: today(),
	});

	if (options.quiet) {
		return;
	}

	write(io.stdout, `Created ${getRecordId(result.record)} ${getRecordTitle(result.record)}\n`);
	write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);

	if (result.proposedTags.length > 0) {
		write(io.stdout, `Proposed tags: ${result.proposedTags.join(', ')}\n`);
	}

	if (result.proposedDomains.length > 0) {
		write(io.stdout, `Proposed domains: ${result.proposedDomains.join(', ')}\n`);
	}

}

async function runCandidateList(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseCandidateListArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const records = await listDecisionRecords(paths, parsed.status);
	const matches = records.filter(record => getRecordId(record).startsWith('CAND-'));

	if (options.quiet) {
		return;
	}

	for (const record of matches) {
		write(io.stdout, `${getRecordId(record)} ${getRecordTitle(record)} (${getRecordStatus(record)})\n`);
	}
}

async function runCandidateShow(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length !== 1) {
		write(io.stderr, 'Usage: sundial candidate show <id>\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const record = await findCandidate(paths, args[0]);
	if (record === undefined) {
		write(io.stderr, `No candidate found with id "${args[0]}".\n`);
		io.exitCode = 1;
		return;
	}

	if (!options.quiet) {
		renderRecord(record, 'full', paths, io);
	}
}

async function runCandidateAccept(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length !== 1) {
		write(io.stderr, 'Usage: sundial candidate accept <id>\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await acceptCandidate(paths, await readTagVocabulary(paths.tags), args[0], today());
		if (!options.quiet) {
			write(io.stdout, `Accepted ${args[0]} as ${getRecordId(result.record)}\n`);
			write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runCandidateReject(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseCandidateRejectArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await rejectCandidate(paths, parsed.id, parsed.reason);
		if (!options.quiet) {
			write(io.stdout, `Rejected ${parsed.id}\n`);
			write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runCandidateRetire(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseCandidateRetireArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await retireCandidate(paths, parsed.id, parsed.by);
		if (!options.quiet) {
			write(io.stdout, `Retired ${parsed.id}${parsed.by === undefined ? '' : ` by ${parsed.by}`}\n`);
			write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runDr(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const [subcommand, ...subcommandArgs] = args;

	if (subcommand === 'retrieve') {
		await runDrRetrieve(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'get') {
		await runDrGet(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'list') {
		await runDrList(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'enable') {
		await runDrSetEnabled(options, subcommandArgs, true, io);
		return;
	}

	if (subcommand === 'disable') {
		await runDrSetEnabled(options, subcommandArgs, false, io);
		return;
	}

	if (subcommand === 'retire') {
		await runDrRetire(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'promote') {
		await runDrPromote(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'delete') {
		await runDrDelete(options, subcommandArgs, io);
		return;
	}

	write(io.stderr, 'Usage: sundial dr (retrieve | get | list | enable | disable | retire | promote | delete)\n');
	io.exitCode = 64;
}

async function runDrRetrieve(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.includes('--help') || args.includes('-h')) {
		write(io.stdout, retrieveHelp());
		return;
	}

	const parsed = parseRetrieveArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const vocabulary = await readTagVocabulary(paths.tags);
	const knownTags = new Set(vocabulary.tags.map(tag => tag.name));
	const unknownTags = parsed.tags.filter(tag => !knownTags.has(tag));
	const unknownDomain = unknownQueryDomain(vocabulary.domains, parsed.domain);

	if (unknownDomain !== undefined || unknownTags.length > 0) {
		if (unknownDomain !== undefined) {
			write(io.stderr, `Unknown domain "${unknownDomain}".\n`);
		}

		for (const tag of unknownTags) {
			write(io.stderr, `Unknown tag "${tag}".\n`);
		}

		io.exitCode = 1;
		return;
	}

	const records = await listDecisionRecords(paths, 'accepted');
	const matches = records.filter(record => recordMatches(record, parsed.tags, parsed.domain));

	if (options.quiet) {
		return;
	}

	renderRecords(matches, 'medium', paths, io, retrieveRecordRenderOptions);
}

async function runDrGet(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseGetArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const byId = await findDecisionRecordFilesById(paths, parsed.ids);

	for (const id of parsed.ids) {
		if (!byId.has(id)) {
			write(io.stderr, `No DR found with id "${id}".\n`);
			io.exitCode = 1;
		}
	}

	if (options.quiet) {
		return;
	}

	for (const id of parsed.ids) {
		const record = byId.get(id);
		if (record === undefined) {
			continue;
		}

		write(io.stdout, await fs.readFile(record, 'utf8'));
	}
}

async function findDecisionRecordFilesById(paths: StorePaths, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
	const wanted = new Set(ids);
	const found = new Map<string, string>();

	for (const status of decisionRecordStatuses) {
		const directory = decisionRecordDirectory(paths, status);
		let entries: readonly string[];
		try {
			entries = await fs.readdir(directory);
		} catch (error) {
			if (isNodeError(error) && error.code === 'ENOENT') {
				continue;
			}

			throw error;
		}

		for (const name of [...entries].sort()) {
			if (!name.toLowerCase().endsWith('.md')) {
				continue;
			}

			for (const id of wanted) {
				if (!found.has(id) && (name === `${id}.md` || name.startsWith(`${id}-`))) {
					found.set(id, path.join(directory, name));
				}
			}
		}
	}

	return found;
}

async function runDrList(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseListArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const records = await listDecisionRecords(paths, parsed.status);
	const matches = parsed.tag === undefined
		? records
		: records.filter(record => getRecordTags(record).includes(parsed.tag ?? ''));

	if (options.quiet) {
		return;
	}

	renderRecordList(matches, io);
}

async function runDrSetEnabled(
	options: CliOptions,
	args: readonly string[],
	enabled: boolean,
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length !== 1) {
		write(io.stderr, `Usage: sundial dr ${enabled ? 'enable' : 'disable'} <id>\n`);
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await setDecisionRecordEnabled(paths, args[0], enabled);
		if (!options.quiet) {
			write(io.stdout, `${enabled ? 'Enabled' : 'Disabled'} ${getRecordId(result.record)}\n`);
			write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runDrRetire(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseDrRetireArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await retireDecisionRecord(paths, parsed.id, parsed.by);
		if (!options.quiet) {
			write(io.stdout, `Retired ${parsed.id}${parsed.by === undefined ? '' : ` by ${parsed.by}`}\n`);
			write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runDrPromote(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseDrPromoteArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const from = parsed.from ?? await findHistoricalRecordStatus(paths, parsed.id);
	if (from === undefined) {
		write(io.stderr, `No rejected or retired DR found with id "${parsed.id}".\n`);
		io.exitCode = 1;
		return;
	}

	try {
		const result = await promoteDecisionRecord(paths, await readTagVocabulary(paths.tags), parsed.id, from, today());
		if (!options.quiet) {
			write(io.stdout, `Promoted ${parsed.id} as ${getRecordId(result.record)}\n`);
			write(io.stdout, `Path: ${formatRecordPath(paths, result.record)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runDrDelete(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseDrDeleteArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const from = parsed.from ?? await findHistoricalRecordStatus(paths, parsed.id);
	if (from === undefined) {
		write(io.stderr, `No rejected or retired DR found with id "${parsed.id}".\n`);
		io.exitCode = 1;
		return;
	}

	try {
		const result = await deleteDecisionRecord(paths, parsed.id, from);
		if (!options.quiet) {
			write(io.stdout, `Deleted ${result.id} ${result.title} (${result.status})\n`);
			write(io.stdout, `Removed: ${formatPath(paths, result.from)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

function renderValidationResults(
	results: readonly ValidationResult[],
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	for (const result of results) {
		if (result.errors.length === 0 && result.warnings.length === 0) {
			continue;
		}

		write(io.stdout, `${result.path}\n`);
		for (const error of result.errors) {
			write(io.stdout, `  error: ${error}\n`);
		}

		for (const warning of result.warnings) {
			write(io.stdout, `  warning: ${warning}\n`);
		}
	}
}

function renderStoreValidationResult(
	result: Awaited<ReturnType<typeof validateStore>>,
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	for (const error of result.vocabularyErrors) {
		write(io.stdout, `Vocabulary error: ${error}\n`);
	}

	renderValidationResults(result.validationResults, io);
}

function parseRetrieveArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly tags: readonly string[]; readonly domain: string | undefined } | undefined {
	const tags: string[] = [];
	let domain: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--tag') {
			const value = args[index + 1];
			if (value === undefined) {
				return usageError(retrieveUsage(), io);
			}

			tags.push(value);
			index += 1;
			continue;
		}

		if (arg === '--domain') {
			const value = args[index + 1];
			if (value === undefined || !isValidRecordDomain(value)) {
				return usageError(retrieveUsage(), io);
			}

			domain = value;
			index += 1;
			continue;
		}

		return usageError(retrieveUsage(), io);
	}

	return { tags, domain };
}

function parseGetArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly ids: readonly string[] } | undefined {
	const ids: string[] = [];

	for (const arg of args) {
		if (arg.startsWith('-')) {
			return usageError('Usage: sundial dr get <id> [<id>]\n', io);
		}

		ids.push(arg);
	}

	if (ids.length === 0) {
		return usageError('Usage: sundial dr get <id> [<id>]\n', io);
	}

	return { ids };
}

function parseListArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly status: DecisionRecordStatus | undefined; readonly tag: string | undefined } | undefined {
	let status: DecisionRecordStatus | undefined;
	let tag: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--status') {
			const value = args[index + 1];
			if (!isDecisionRecordStatus(value)) {
				return usageError('Usage: sundial dr list [--status candidate|accepted|rejected|retired] [--tag <tag>]\n', io);
			}

			status = value;
			index += 1;
			continue;
		}

		if (arg === '--tag') {
			const value = args[index + 1];
			if (value === undefined) {
				return usageError('Usage: sundial dr list [--status candidate|accepted|rejected|retired] [--tag <tag>]\n', io);
			}

			tag = value;
			index += 1;
			continue;
		}

		return usageError('Usage: sundial dr list [--status candidate|accepted|rejected|retired] [--tag <tag>]\n', io);
	}

	return { status, tag };
}

function parseCandidateCreateArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): {
	readonly title: string;
	readonly domain: string;
	readonly decision: string;
	readonly appendix: string | undefined;
	readonly affectedFiles: readonly string[];
	readonly tags: readonly string[];
	readonly proposedTagDescriptions: Readonly<Record<string, string>>;
	readonly proposedDomainDescription: string | undefined;
	readonly references: readonly string[];
} | undefined {
	let title: string | undefined;
	let domain = 'all';
	let domainSetBy: 'domain' | 'proposed-domain' | undefined;
	let decision: string | undefined;
	let appendix: string | undefined;
	const affectedFiles: string[] = [];
	const tags: string[] = [];
	const proposedTagDescriptions: Record<string, string> = {};
	let proposedDomainDescription: string | undefined;
	const references: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];

		if (arg === '--title') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			title = value;
			index += 1;
			continue;
		}

		if (arg === '--domain') {
			if (value === undefined || !isValidRecordDomain(value) || domainSetBy !== undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			domain = value;
			domainSetBy = 'domain';
			index += 1;
			continue;
		}

		if (arg === '--proposed-domain') {
			const description = args[index + 2];
			if (value === undefined || description === undefined || !isValidRecordDomain(value) || domainSetBy !== undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			domain = value;
			domainSetBy = 'proposed-domain';
			proposedDomainDescription = description;
			index += 2;
			continue;
		}

		if (arg === '--decision') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			decision = value;
			index += 1;
			continue;
		}

		if (arg === '--appendix') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			appendix = value;
			index += 1;
			continue;
		}

		if (arg === '--affected') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			affectedFiles.push(value);
			index += 1;
			continue;
		}

		if (arg === '--tag') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			tags.push(value);
			index += 1;
			continue;
		}

		if (arg === '--proposed-tag') {
			const description = args[index + 2];
			if (value === undefined || description === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			tags.push(value);
			proposedTagDescriptions[value] = description;
			index += 2;
			continue;
		}

		if (arg === '--ref') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			references.push(value);
			index += 1;
			continue;
		}

		return usageError(candidateCreateUsage(), io);
	}

	if (title === undefined || decision === undefined) {
		return usageError(candidateCreateUsage(), io);
	}

	return {
		title,
		domain,
		decision,
		appendix: appendix?.trim() || undefined,
		affectedFiles,
		tags,
		proposedTagDescriptions,
		proposedDomainDescription,
		references,
	};
}

function parseCandidateListArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly status: DecisionRecordStatus | undefined } | undefined {
	let status: DecisionRecordStatus | undefined = 'candidate';

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--status') {
			const value = args[index + 1];
			if (!isDecisionRecordStatus(value)) {
				return usageError('Usage: sundial candidate list [--status candidate|rejected|retired]\n', io);
			}

			status = value;
			index += 1;
			continue;
		}

		if (arg === '--all') {
			status = undefined;
			continue;
		}

		return usageError('Usage: sundial candidate list [--status candidate|rejected|retired]\n', io);
	}

	return { status };
}

function parseCandidateRejectArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly reason: string | undefined } | undefined {
	const [id, ...rest] = args;
	let reason: string | undefined;

	if (id === undefined) {
		return usageError('Usage: sundial candidate reject <id> [--reason <text>]\n', io);
	}

	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];
		if (arg !== '--reason') {
			return usageError('Usage: sundial candidate reject <id> [--reason <text>]\n', io);
		}

		const value = rest[index + 1];
		if (value === undefined) {
			return usageError('Usage: sundial candidate reject <id> [--reason <text>]\n', io);
		}

		reason = value;
		index += 1;
	}

	return { id, reason };
}

function parseCandidateRetireArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly by: string | undefined } | undefined {
	return parseRetireArgs(args, 'candidate retire', io);
}

function parseDrRetireArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly by: string | undefined } | undefined {
	return parseRetireArgs(args, 'dr retire', io);
}

function parseRetireArgs(
	args: readonly string[],
	command: 'candidate retire' | 'dr retire',
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly by: string | undefined } | undefined {
	const [id, ...rest] = args;
	let by: string | undefined;
	const usage = `Usage: sundial ${command} <id> [--by <id>]\n`;

	if (id === undefined) {
		return usageError(usage, io);
	}

	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];
		if (arg !== '--by') {
			return usageError(usage, io);
		}

		const value = rest[index + 1];
		if (value === undefined) {
			return usageError(usage, io);
		}

		by = value;
		index += 1;
	}

	return { id, by };
}

function parseDrPromoteArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly from: 'rejected' | 'retired' | undefined } | undefined {
	return parseHistoricalDrArgs(args, 'promote', io);
}

function parseDrDeleteArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly from: 'rejected' | 'retired' | undefined } | undefined {
	return parseHistoricalDrArgs(args, 'delete', io);
}

function parseHistoricalDrArgs(
	args: readonly string[],
	command: 'promote' | 'delete',
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly from: 'rejected' | 'retired' | undefined } | undefined {
	const [id, ...rest] = args;
	let from: 'rejected' | 'retired' | undefined;
	const usage = `Usage: sundial dr ${command} <id> [--from rejected|retired]\n`;

	if (id === undefined) {
		return usageError(usage, io);
	}

	for (let index = 0; index < rest.length; index += 1) {
		const arg = rest[index];
		if (arg !== '--from') {
			return usageError(usage, io);
		}

		const value = rest[index + 1];
		if (value !== 'rejected' && value !== 'retired') {
			return usageError(usage, io);
		}

		from = value;
		index += 1;
	}

	return { id, from };
}

function parseBootstrapArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly provider: BootstrapProvider } | undefined {
	let provider: BootstrapProvider | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg !== '--provider') {
			return usageError(bootstrapUsage(), io);
		}

		const value = args[index + 1];
		if (value !== 'claude' && value !== 'codex') {
			return usageError(bootstrapUsage(), io);
		}

		provider = value;
		index += 1;
	}

	if (provider === undefined) {
		return usageError(bootstrapUsage(), io);
	}

	return { provider };
}

function bootstrapUsage(): string {
	return 'Usage: sundial bootstrap --provider claude|codex\n';
}

export function bootstrapCommand(
	provider: BootstrapProvider,
	root: string,
	prompt: string,
): BootstrapCommand {
	if (provider === 'claude') {
		return {
			file: 'claude',
			args: [
				'--print',
				'--permission-mode',
				'acceptEdits',
				'--allowedTools',
				[
					'Read',
					'Glob',
					'Grep',
					'Bash(sundial --cwd * candidate create *)',
					'Bash(sundial --cwd * tags)',
					'Bash(sundial --cwd * dr list *)',
				].join(','),
				prompt,
			],
		};
	}

	return {
		file: 'codex',
		args: [
			'exec',
			'--cd',
			root,
			'--full-auto',
			'--skip-git-repo-check',
			prompt,
		],
	};
}

export async function runBootstrapCommand(
	command: BootstrapCommand,
	cwd: string,
	io?: BootstrapOutput,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command.file, command.args, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let settled = false;

		child.stdout.on('data', (chunk: Buffer) => {
			io?.stdout.write(chunk);
		});

		child.stderr.on('data', (chunk: Buffer) => {
			io?.stderr.write(chunk);
		});

		child.on('error', (error: Error) => {
			if (settled) {
				return;
			}

			settled = true;
			reject(error);
		});

		child.on('close', (code, signal) => {
			if (settled) {
				return;
			}

			settled = true;
			if (code === 0) {
				resolve();
				return;
			}

			if (signal !== null) {
				reject(new Error(`Command failed with signal ${signal}: ${formatBootstrapCommand(command)}`));
				return;
			}

			reject(new Error(`Command failed with exit code ${code ?? 'unknown'}: ${formatBootstrapCommand(command)}`));
		});
	});
}

function formatBootstrapCommand(command: BootstrapCommand): string {
	const args = command.args.map((arg, index) => {
		const isPrompt = index === command.args.length - 1;
		return isPrompt ? '<prompt>' : shellQuote(arg);
	});

	return [shellQuote(command.file), ...args].join(' ');
}

function bootstrapPrompt(paths: StorePaths): string {
	const root = paths.root;

	return [
		'You are running a Sundial bootstrap.',
		'',
		`Project root: ${root}`,
		'',
		'Goal:',
		'- Inspect existing project instructions, markdown documentation, and representative source code.',
		'- Find consequential project-specific decisions that should become Sundial Decision Record candidates.',
		'- Create candidates only by running the public Sundial CLI. Do not write .sundial files directly.',
		'',
		'Important candidate creation contract:',
		`- Use this command shape: sundial --cwd ${shellQuote(root)} candidate create --title "<title>" --domain "<domain>" --decision "<terse guidance>"`,
		'- Use --proposed-domain <domain> "<description>" instead of --domain when the domain is not already listed in .sundial/tags.md.',
		'- Add --tag <known-tag> when a known tag applies.',
		'- Use --proposed-tag <tag> "<description>" when a new tag is truly useful.',
		'- Add --appendix "<human-facing context>" only when explanatory background helps reviewers; do not put governing guidance there.',
		'- Add --affected <path> and --ref <path-or-symbol> when useful.',
		'- Use existing domains and tags from .sundial/tags.md when possible. Proposed vocabulary is for truly useful missing terms.',
		'- Every DR candidate must go through `sundial candidate create`; do not create markdown files manually.',
		'',
		'What to inspect:',
		'- AGENTS.md, AGENT.md, CLAUDE.md, .agents/**, .claude/**.',
		'- README files, architecture/design/ADR docs, implementation plans, and other meaningful markdown.',
		'- Source tree structure and representative implementation files that reveal project conventions.',
		'- Existing accepted and candidate DRs, so you do not duplicate them.',
		'',
		'What to avoid:',
		'- Do not create candidates for generic best practices, obvious framework behavior, style preferences with no architectural consequence, or speculation.',
		'- Do not edit application source, docs, tags, or accepted DRs.',
		'- Prefer fewer, high-signal candidates.',
		'',
		'After creating candidates, summarize what you created. If no DR-worthy decisions exist, say that and create nothing.',
	].join('\n');
}

function shellQuote(value: string): string {
	return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}

function candidateCreateUsage(): string {
	return 'Usage: sundial candidate create --title <title> [--domain <domain> | --proposed-domain <domain> <description>] --decision <text> [--appendix <text>] [--tag <tag>] [--proposed-tag <tag> <description>] [--affected <path>] [--ref <ref>]\n';
}

function retrieveUsage(): string {
	return 'Usage: sundial dr retrieve [--domain <domain>] [--tag <tag>...]\n';
}

function retrieveHelp(): string {
	return `Usage: sundial dr retrieve [--domain <domain>] [--tag <tag>...]

Retrieve visible accepted Decision Records.

Options:
  --domain <domain>  Filter by domain. Matches the exact domain, its ancestors, and its descendants. Omit to match every domain.
  --tag <tag>        Filter by tag. Repeat for multiple tags. A DR matches when any provided tag is on it; DRs with no tags always match.
`;
}

function renderRecords(
	records: readonly DecisionRecord[],
	detail: DetailLevel,
	paths: StorePaths,
	io: Pick<NodeJS.Process, 'stdout'>,
	options: RecordRenderOptions = defaultRecordRenderOptions,
): void {
	if (records.length === 0) {
		write(io.stdout, 'No matching DRs.\n');
		return;
	}

	for (const [index, record] of records.entries()) {
		if (index > 0) {
			write(io.stdout, '\n');
		}

		renderRecord(record, detail, paths, io, options);
	}
}

function renderRecord(
	record: DecisionRecord,
	detail: DetailLevel,
	paths: StorePaths,
	io: Pick<NodeJS.Process, 'stdout'>,
	options: RecordRenderOptions = defaultRecordRenderOptions,
): void {
	if (detail === 'full') {
		write(io.stdout, record.markdown.trimEnd());
		write(io.stdout, '\n');
		return;
	}

	write(io.stdout, `${getRecordId(record)} ${getRecordTitle(record)}\n`);
	if (options.showStatus) {
		write(io.stdout, `Status: ${getRecordStatus(record)}\n`);
	}
	if (options.showEnabled && !getRecordEnabled(record)) {
		write(io.stdout, 'Enabled: false\n');
	}
	write(io.stdout, `Domain: ${getRecordDomain(record)}\n`);
	write(io.stdout, `Tags: ${formatRecordTags(record)}\n`);

	if (detail === 'medium') {
		write(io.stdout, `Decision:\n${getRecordDecision(record)}\n`);
		renderOptionalSection(record, 'Applies When', 'Applies when', io);
		renderOptionalSection(record, 'Does Not Apply When', 'Does not apply when', io);

		const references = getRecordReferences(record);
		if (references.length > 0) {
			write(io.stdout, 'References:\n');
			for (const reference of references) {
				write(io.stdout, `- ${reference}\n`);
			}
		}
	}

	if (options.showPath) {
		write(io.stdout, `Path: ${formatRecordPath(paths, record)}\n`);
	}
}

function renderOptionalSection(
	record: DecisionRecord,
	sectionTitle: string,
	outputTitle: string,
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	const section = getRecordSection(record, sectionTitle);
	if (section === undefined || section.length === 0) {
		return;
	}

	write(io.stdout, `${outputTitle}:\n${section}\n`);
}

function recordMatches(record: DecisionRecord, tags: readonly string[], domain: string | undefined): boolean {
	return getRecordEnabled(record) && recordMatchesTags(record, tags) && recordMatchesDomain(record, domain);
}

function recordMatchesTags(record: DecisionRecord, tags: readonly string[]): boolean {
	if (tags.length === 0) {
		return true;
	}

	const recordTagsList = getRecordTags(record);
	if (recordTagsList.length === 0) {
		return true;
	}

	const recordTags = new Set(recordTagsList);
	return tags.some(tag => recordTags.has(tag));
}

function recordMatchesDomain(record: DecisionRecord, domain: string | undefined): boolean {
	if (domain === undefined || domain === 'all') {
		return true;
	}

	const recordDomain = getRecordDomain(record);
	if (recordDomain === 'all') {
		return true;
	}

	return recordDomain === domain
		|| recordDomain.startsWith(`${domain}.`)
		|| domain.startsWith(`${recordDomain}.`);
}

function formatRecordTags(record: DecisionRecord): string {
	const tags = getRecordTags(record);
	return tags.length === 0 ? '(wildcard)' : tags.join(', ');
}

function formatRecordListItem(record: DecisionRecord): string {
	return `${getRecordId(record)} ${getRecordTitle(record)} Domain: ${getRecordDomain(record)} Tags: ${formatRecordTags(record)}`;
}

function renderRecordList(
	records: readonly DecisionRecord[],
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	const groups = [
		{ heading: 'Rejected', records: records.filter(record => getRecordStatus(record) === 'rejected') },
		{ heading: 'Candidate', records: records.filter(record => getRecordStatus(record) === 'candidate') },
		{ heading: 'Retired', records: records.filter(record => getRecordStatus(record) === 'retired') },
		{ heading: 'Active', records: records.filter(record => getRecordStatus(record) === 'accepted' && getRecordEnabled(record)) },
		{ heading: 'Active(hidden)', records: records.filter(record => getRecordStatus(record) === 'accepted' && !getRecordEnabled(record)) },
	];
	let renderedAnyGroup = false;
	for (const group of groups) {
		if (group.records.length === 0) {
			continue;
		}

		if (renderedAnyGroup) {
			write(io.stdout, '\n');
		}

		write(io.stdout, `${group.heading}:\n`);
		for (const record of group.records) {
			write(io.stdout, `${formatRecordListItem(record)}\n`);
		}
		renderedAnyGroup = true;
	}
}

async function findHistoricalRecordStatus(
	paths: StorePaths,
	id: string,
): Promise<'rejected' | 'retired' | undefined> {
	for (const status of ['rejected', 'retired'] as const) {
		const records = await listDecisionRecords(paths, status);
		if (records.some(record => getRecordId(record) === id)) {
			return status;
		}
	}

	return undefined;
}

function formatRecordPath(paths: StorePaths, record: DecisionRecord): string {
	return formatPath(paths, record.filePath);
}

function formatPath(paths: StorePaths, targetPath: string): string {
	const relativePath = path.relative(paths.root, targetPath);
	return relativePath.split(path.sep).join('/');
}

function usageError<T>(message: string, io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): T | undefined {
	write(io.stderr, message);
	io.exitCode = 64;
	return undefined;
}

function isDetailLevel(value: string | undefined): value is DetailLevel {
	return value === 'short' || value === 'medium' || value === 'full';
}

function isDecisionRecordStatus(value: string | undefined): value is DecisionRecordStatus {
	return value === 'candidate' || value === 'accepted' || value === 'rejected' || value === 'retired';
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function defaultAuthor(): string {
	return process.env.USER ?? process.env.USERNAME ?? 'agent';
}

function writeError(error: unknown, io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): void {
	const message = error instanceof Error ? error.message : String(error);
	write(io.stderr, `${message}\n`);
	io.exitCode = 1;
}

async function runStatus(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length > 0) {
		write(io.stderr, `Unexpected arguments for status: ${args.join(' ')}\n`);
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const vocabulary = await readTagVocabulary(paths.tags);
	const validation = await validateStore(paths);
	const errorCount = validationErrorCount(validation);
	const warningCount = validationWarningCount(validation);
	const counts = await Promise.all(
		decisionRecordStatuses.map(async status => ({
			status,
			count: await countDecisionRecords(paths, status),
		})),
	);

	if (options.quiet) {
		if (errorCount > 0) {
			io.exitCode = 1;
		}

		return;
	}

	write(io.stdout, `Sundial store: ${paths.store}\n`);
	write(io.stdout, `Domains: ${vocabulary.domains.length}\n`);
	write(io.stdout, `Tags: ${vocabulary.tags.length}\n`);

	for (const item of counts) {
		write(io.stdout, `${formatStatusLabel(item.status)} DRs: ${item.count}\n`);
	}

	write(io.stdout, '\n');
	renderStoreValidationResult(validation, io);
	write(io.stdout, `Validation: ${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}.\n`);
	if (errorCount > 0) {
		io.exitCode = 1;
	}
}

async function runUpdate(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseUpdateArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = parsed.root === undefined
		? await requireStore(options.cwd, io)
		: await requireStoreAtRoot(parsed.root, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await updateRuntimeAssets(paths.root, parsed);
		if (options.quiet) {
			return;
		}

		write(io.stdout, `Updated Sundial skill files at ${result.paths.root}\n`);
		renderPathGroup('Created', result.created, io);
		renderPathGroup('Already current', result.existing, io);
		renderPathGroup('Updated', result.updated, io);
	} catch (error) {
		writeError(error, io);
	}
}

interface ParsedUpdateArgs {
	readonly root?: string;
	readonly claude: boolean;
	readonly codex: boolean;
}

function parseUpdateArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): ParsedUpdateArgs | undefined {
	let root: string | undefined;
	let claude = false;
	let codex = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--root') {
			const value = args[index + 1];
			if (value === undefined) {
				return updateUsageError(io);
			}

			root = value;
			index += 1;
			continue;
		}

		if (arg === '--claude') {
			claude = true;
			continue;
		}

		if (arg === '--codex') {
			codex = true;
			continue;
		}

		return updateUsageError(io);
	}

	if (!claude && !codex) {
		return updateUsageError(io);
	}

	return { root, claude, codex };
}

function updateUsageError(io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): undefined {
	write(io.stderr, 'Usage: sundial update [--root <path>] --claude|--codex\n');
	io.exitCode = 64;
	return undefined;
}

function parseArguments(argv: readonly string[], defaultCwd: string): CliOptions {
	const command: string[] = [];
	let cwd = defaultCwd;
	let quiet = false;
	let noSessionLog = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (command.length > 0) {
			command.push(arg);
			continue;
		}

		if (arg === '--cwd') {
			const value = argv[index + 1];
			if (value === undefined) {
				throw new CliUsageError('--cwd requires a path');
			}

			cwd = value;
			index += 1;
			continue;
		}

		if (arg === '--quiet') {
			quiet = true;
			continue;
		}

		if (arg === '--no-session-log') {
			noSessionLog = true;
			continue;
		}

		command.push(arg);
	}

	return { cwd, quiet, noSessionLog, command };
}

async function runInit(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseInitArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const result = await initStore(parsed.root, {
		claude: parsed.claude,
		codex: parsed.codex,
	});

	if (options.quiet) {
		return;
	}

	write(io.stdout, `Initialized Sundial store at ${result.paths.store}\n`);

	if (!parsed.claude && !parsed.codex) {
		write(io.stdout, 'Agent runtime bootstrap skipped. Pass --claude, --codex, or both to install runtime assets.\n');
	}

	if (result.created.length > 0) {
		renderPathGroup('Created', result.created, io);
	}

	if (result.existing.length > 0) {
		renderPathGroup('Already present', result.existing, io);
	}

	if (result.updated.length > 0) {
		renderPathGroup('Updated', result.updated, io);
	}
}

function renderPathGroup(
	title: string,
	items: readonly string[],
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	if (items.length === 0) {
		return;
	}

	write(io.stdout, `\n${title}:\n`);
	for (const item of items) {
		write(io.stdout, `- ${item}\n`);
	}
}

interface ParsedInitArgs {
	readonly root: string;
	readonly claude: boolean;
	readonly codex: boolean;
}

function parseInitArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): ParsedInitArgs | undefined {
	let root: string | undefined;
	let claude = false;
	let codex = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--root') {
			const value = args[index + 1];
			if (value === undefined) {
				return initUsageError(io);
			}

			root = value;
			index += 1;
			continue;
		}

		if (arg === '--claude') {
			claude = true;
			continue;
		}

		if (arg === '--codex') {
			codex = true;
			continue;
		}

		return initUsageError(io);
	}

	if (root === undefined) {
		return initUsageError(io);
	}

	return { root, claude, codex };
}

function initUsageError(io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): undefined {
	write(io.stderr, 'Usage: sundial init --root <path> [--claude] [--codex]\n');
	io.exitCode = 64;
	return undefined;
}

async function runTags(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length > 0) {
		write(io.stderr, `Usage: sundial tags\n`);
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const vocabulary = await readTagVocabulary(paths.tags);
	if (!validateVocabularyForListing(vocabulary.errors, io)) {
		return;
	}

	if (options.quiet) {
		return;
	}

	write(io.stdout, 'Domains:\n');
	renderVocabularyDefinitions(vocabulary.domains, 'domains', io);
	write(io.stdout, '\nTags:\n');
	renderVocabularyDefinitions(vocabulary.tags, 'tags', io);
}

function validateVocabularyForListing(
	errors: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): boolean {
	if (errors.length === 0) {
		return true;
	}

	for (const error of errors) {
		write(io.stderr, `${error}\n`);
	}

	io.exitCode = 1;
	return false;
}

function renderVocabularyDefinitions(
	definitions: readonly (DomainDefinition | TagDefinition)[],
	label: 'domains' | 'tags',
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	if (definitions.length === 0) {
		write(io.stdout, `No ${label} defined.\n`);
		return;
	}

	for (const definition of definitions) {
		write(io.stdout, `${definition.name}`);
		if (definition.description.length > 0) {
			write(io.stdout, ` - ${definition.description.replace(/\s+/g, ' ')}`);
		}

		write(io.stdout, '\n');
	}
}

function unknownQueryDomain(domains: readonly DomainDefinition[], domain: string | undefined): string | undefined {
	if (domain === undefined || domain === 'all' || domains.length === 0) {
		return undefined;
	}

	const knownDomains = new Set(domains.map(item => item.name));
	return knownDomains.has(domain) ? undefined : domain;
}

async function requireStore(
	cwd: string,
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): Promise<StorePaths | undefined> {
	const paths = await discoverStore(cwd);

	if (paths === undefined) {
		write(io.stderr, 'No .sundial store found. Run sundial init --root <path> first.\n');
		io.exitCode = 1;
		return undefined;
	}

	return paths;
}

async function requireStoreAtRoot(
	root: string,
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): Promise<StorePaths | undefined> {
	const paths = getStorePaths(root);

	if (!await pathExists(paths.store)) {
		write(io.stderr, `No .sundial store found at ${paths.root}. Run sundial init --root ${paths.root} first.\n`);
		io.exitCode = 1;
		return undefined;
	}

	return paths;
}

class CliUsageError extends Error {}

function write(stream: NodeJS.WritableStream, text: string): void {
	stream.write(text);
}

function formatStatusLabel(status: string): string {
	return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}

if (require.main === module) {
	main(process.argv.slice(2), process).catch((error: unknown) => {
		if (error instanceof CliUsageError) {
			process.stderr.write(`${error.message}\n\n${usage}`);
			process.exitCode = 64;
			return;
		}

		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exitCode = 1;
	});
}
