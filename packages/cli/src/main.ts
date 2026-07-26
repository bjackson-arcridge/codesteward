import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
	acceptCandidate,
	createCandidate,
	deleteDecisionRecord,
	dismissCandidate,
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
	getRecordDomain,
	getRecordEnabled,
	getRecordId,
	getRecordReferences,
	getRecordSection,
	getRecordStatus,
	getRecordTitle,
	isValidRecordDomain,
	listDecisionRecords,
	ValidationResult,
} from './core/dr';
import {
	addDomain,
	readDomainsJson,
	readDomainVocabulary,
	removeDomain,
	updateDomain,
	type DomainDefinition,
} from './core/domains';
import {
	countDecisionRecords,
	decisionRecordDirectory,
	decisionRecordStatuses,
	DecisionRecordStatus,
	discoverStore,
	getStorePaths,
	initStore,
	loadStorePaths,
	pathExists,
	readSundialInstructions,
	StorePaths,
	updateRuntimeAssets,
} from './core/store';
import {
	createSpec,
	deleteSpec,
	ensureSpecTemplate,
	findSpec,
	listSpecs,
	readSpecLanes,
	readSpecStatuses,
	renderSpecBoard,
	setSpecStatus,
	type SpecRecord,
} from './core/specs';
import {
	createManagedSpecWorktree,
	finishManagedSpecWorktree,
	listManagedSpecWorktrees,
	type ManagedWorktreeFinishResult,
	type ManagedWorktreePreflight,
	type ManagedWorktreeTopology,
	preflightManagedSpecWorktree,
} from './core/worktrees';

const packageJson = require('../package.json') as { readonly version: string };
const cliVersion = packageJson.version;

interface CliOptions {
	readonly cwd: string;
	readonly quiet: boolean;
	readonly noSessionLog: boolean;
	readonly version: boolean;
	readonly command: readonly string[];
}

const usage = `Sundial CLI

Usage:
  sundial [--cwd <path>] [--quiet] [--no-session-log] [--version] <command>

Commands:
  init        Create or update the project-local sundial store at an explicit root
  update      Update installed files for the discovered or explicit project root
  status      Report store health, counts, and validation state
  domains     List, add, update, or remove domains in sundial/domains.md
  dr retrieve Retrieve visible accepted DRs by relevant domains
  dr get      Cat DR markdown files by id
  dr list     List DRs by status
  dr enable   Include an accepted DR in retrieval results
  dr disable  Suppress an accepted DR from retrieval results
  dr retire   Move an accepted DR to retired history
  dr promote  Move a rejected or retired DR back to accepted precedent
  dr delete   Remove a rejected or retired DR file from disk
  candidate   Create, list, show, accept, reject, retire, or dismiss candidates
  spec        Create, list, show, update, delete, or render implementation specs
  worktree    List, create, inspect, or finish managed spec worktrees
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

	if (parsed.version) {
		write(io.stdout, `${cliVersion}\n`);
		return;
	}

	if (parsed.command.length === 0 || parsed.command[0] === 'help' || parsed.command[0] === '--help') {
		write(io.stdout, usage);
		write(io.stdout, '\n');
		write(io.stdout, await renderDecisionRecordGuidance());
		return;
	}

	const [command, ...commandArgs] = parsed.command;

	if (command === 'init') {
		await runInit(parsed, commandArgs, io);
		return;
	}

	if (command === 'domains') {
		await runDomains(parsed, commandArgs, io);
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

	if (command === 'dr') {
		await runDr(parsed, commandArgs, io);
		return;
	}

	if (command === 'candidate') {
		await runCandidate(parsed, commandArgs, io);
		return;
	}

	if (command === 'spec') {
		await runSpec(parsed, commandArgs, io);
		return;
	}

	if (command === 'worktree') {
		await runWorktree(parsed, commandArgs, io);
		return;
	}

	write(io.stderr, `Unknown command: ${command}\n\n${usage}`);
	io.exitCode = 64;
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

	if (subcommand === 'dismiss') {
		await runCandidateDismiss(options, subcommandArgs, io);
		return;
	}

	write(io.stderr, 'Usage: sundial candidate (create | list | show | accept | reject | retire | dismiss)\n');
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

	const vocabulary = await readDomainVocabulary(paths.domains);
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
		const result = await acceptCandidate(paths, await readDomainVocabulary(paths.domains), args[0], today());
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

async function runCandidateDismiss(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length !== 1) {
		write(io.stderr, 'Usage: sundial candidate dismiss <id>\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		await dismissCandidate(paths, args[0]);
		if (!options.quiet) {
			write(io.stdout, `Dismissed ${args[0]}\n`);
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

async function runSpec(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const [subcommand, ...subcommandArgs] = args;

	if (subcommand === 'create') {
		await runSpecCreate(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'template') {
		await runSpecTemplate(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'list') {
		await runSpecList(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'board') {
		await runSpecBoard(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'show') {
		await runSpecShow(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'status' || subcommand === 'update-status') {
		await runSpecStatus(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'delete') {
		await runSpecDelete(options, subcommandArgs, io);
		return;
	}

	if (subcommand === 'lanes') {
		await runSpecLanes(options, subcommandArgs, io);
		return;
	}

	write(io.stderr, 'Usage: sundial spec (create | template | list | board | show | status | update-status | delete | lanes)\n');
	io.exitCode = 64;
}

async function runWorktree(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const [subcommand, ...subcommandArgs] = args;
	const parsed = parseWorktreeArgs(subcommand, subcommandArgs, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		if (parsed.command === 'list') {
			const result = await listManagedSpecWorktrees(paths);
			writeWorktreeResult(options, parsed.json, result, io);
			return;
		}

		if (parsed.command === 'create') {
			const result = await createManagedSpecWorktree(paths, parsed.specId);
			writeWorktreeResult(options, parsed.json, result, io);
			return;
		}

		if (parsed.command === 'preflight') {
			const result = await preflightManagedSpecWorktree(paths, parsed.specId);
			writeWorktreeResult(options, parsed.json, result, io);
			return;
		}

		if (parsed.command !== 'finish') {
			return;
		}

		const result = await finishManagedSpecWorktree(paths, parsed.specId, {
			expectedPrimaryHead: parsed.expectedPrimaryHead,
			expectedWorktreeHead: parsed.expectedWorktreeHead,
			primaryCommitMessage: parsed.primaryCommitMessage,
			worktreeCommitMessage: parsed.worktreeCommitMessage,
		});
		writeWorktreeResult(options, parsed.json, result, io);
		if (!parsed.json && (result.kind === 'failed' || result.kind === 'stale' || result.kind === 'blocked')) {
			io.exitCode = 1;
		}
	} catch (error) {
		writeError(error, io);
	}
}

type ParsedWorktreeArgs =
	| { readonly command: 'list'; readonly json: boolean }
	| { readonly command: 'create' | 'preflight'; readonly specId: string; readonly json: boolean }
	| {
		readonly command: 'finish';
		readonly specId: string;
		readonly expectedPrimaryHead: string;
		readonly expectedWorktreeHead: string;
		readonly primaryCommitMessage?: string;
		readonly worktreeCommitMessage?: string;
		readonly json: boolean;
	};

function parseWorktreeArgs(
	subcommand: string | undefined,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): ParsedWorktreeArgs | undefined {
	const worktreeUsage = 'Usage: sundial worktree (list [--json] | create <spec-id> [--json] | preflight <spec-id> [--json] | finish <spec-id> --expected-primary <sha> --expected-worktree <sha> [--primary-message <text>] [--worktree-message <text>] [--json])\n';
	if (subcommand === 'list') {
		if (args.length === 0) {
			return { command: 'list', json: false };
		}
		if (args.length === 1 && args[0] === '--json') {
			return { command: 'list', json: true };
		}
		return usageError(worktreeUsage, io);
	}

	if (subcommand !== 'create' && subcommand !== 'preflight' && subcommand !== 'finish') {
		return usageError(worktreeUsage, io);
	}

	const [specId, ...flags] = args;
	if (specId === undefined || specId.startsWith('--')) {
		return usageError(worktreeUsage, io);
	}

	let json = false;
	let expectedPrimaryHead: string | undefined;
	let expectedWorktreeHead: string | undefined;
	let primaryCommitMessage: string | undefined;
	let worktreeCommitMessage: string | undefined;

	for (let index = 0; index < flags.length; index += 1) {
		const flag = flags[index];
		if (flag === '--json') {
			json = true;
			continue;
		}

		const value = flags[index + 1];
		if (value === undefined) {
			return usageError(worktreeUsage, io);
		}
		if (flag === '--expected-primary') {
			expectedPrimaryHead = value;
		} else if (flag === '--expected-worktree') {
			expectedWorktreeHead = value;
		} else if (flag === '--primary-message') {
			primaryCommitMessage = value;
		} else if (flag === '--worktree-message') {
			worktreeCommitMessage = value;
		} else {
			return usageError(worktreeUsage, io);
		}
		index += 1;
	}

	if (subcommand !== 'finish') {
		if (expectedPrimaryHead !== undefined || expectedWorktreeHead !== undefined
			|| primaryCommitMessage !== undefined || worktreeCommitMessage !== undefined) {
			return usageError(worktreeUsage, io);
		}
		return { command: subcommand, specId, json };
	}

	if (expectedPrimaryHead === undefined || expectedWorktreeHead === undefined) {
		return usageError(worktreeUsage, io);
	}

	return {
		command: 'finish',
		specId,
		expectedPrimaryHead,
		expectedWorktreeHead,
		primaryCommitMessage,
		worktreeCommitMessage,
		json,
	};
}

function writeWorktreeResult(
	options: CliOptions,
	json: boolean,
	result: ManagedWorktreeTopology | ManagedWorktreePreflight | ManagedWorktreeFinishResult
		| Awaited<ReturnType<typeof createManagedSpecWorktree>>,
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	if (options.quiet) {
		return;
	}
	if (json) {
		write(io.stdout, `${JSON.stringify(result)}\n`);
		return;
	}

	if (result.kind === 'topology') {
		write(io.stdout, `Primary: ${result.primaryPath}\nActive: ${result.activePath}\n`);
		for (const spec of result.specs) {
			const detail = spec.state.kind === 'none'
				? 'none'
				: spec.state.kind === 'error'
					? `error: ${spec.state.message}`
					: `${spec.state.kind}: ${spec.state.worktreePath}`;
			write(io.stdout, `${spec.id}: ${detail}\n`);
		}
		return;
	}

	if (result.kind === 'created') {
		write(io.stdout, `Created ${result.specId} worktree at ${result.worktreePath} on ${result.branch}.\n`);
		return;
	}
	if (result.kind === 'ready') {
		write(io.stdout, `${result.specId} is ready to finish from ${result.worktreePath}.\n`);
		return;
	}
	if (result.kind === 'completed') {
		write(io.stdout, `Finished ${result.specId}; merged ${result.branch} and removed ${result.removedWorktreePath}.\n`);
		return;
	}
	if (result.kind === 'conflicts') {
		write(io.stdout, `Rebase conflicts for ${result.specId}: ${result.conflictPaths.join(', ')}\n`);
		return;
	}
	write(io.stdout, `${result.kind}: ${result.message}\n`);
}

async function runSpecCreate(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseSpecCreateArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await createSpec(paths, {
			title: parsed.title,
			status: parsed.status,
			author: defaultAuthor(),
			created: today(),
		});

		if (!options.quiet) {
			write(io.stdout, `Created ${result.spec.id} ${result.spec.title}\n`);
			write(io.stdout, `Status: ${result.spec.status}\n`);
			write(io.stdout, `Path: ${formatPath(paths, result.spec.filePath)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runSpecTemplate(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length > 0) {
		write(io.stderr, 'Usage: sundial spec template\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await ensureSpecTemplate(paths);
		if (!options.quiet) {
			write(io.stdout, result.created ? 'Created spec template.\n' : 'Spec template already exists.\n');
			write(io.stdout, `Path: ${formatPath(paths, result.filePath)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runSpecList(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseSpecListArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined || options.quiet) {
		return;
	}

	if (parsed.status !== undefined) {
		try {
			requireKnownSpecStatus(parsed.status, await readSpecStatuses(paths));
		} catch (error) {
			writeError(error, io);
			return;
		}
	}

	for (const spec of (await listSpecs(paths)).filter(spec => parsed.status === undefined || spec.status === parsed.status)) {
		write(io.stdout, `${formatSpecListItem(spec)} Path: ${formatPath(paths, spec.filePath)}\n`);
	}
}

async function runSpecShow(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length !== 1) {
		write(io.stderr, 'Usage: sundial spec show <id>\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	const spec = await findSpec(paths, args[0]);
	if (spec === undefined) {
		write(io.stderr, `No spec found with id "${args[0]}".\n`);
		io.exitCode = 1;
		return;
	}

	if (!options.quiet) {
		write(io.stdout, await fs.readFile(spec.filePath, 'utf8'));
	}
}

async function runSpecBoard(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length > 0) {
		write(io.stderr, 'Usage: sundial spec board\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined || options.quiet) {
		return;
	}

	write(io.stdout, await renderSpecBoard(paths));
}

async function runSpecStatus(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const parsed = parseSpecStatusArgs(args, io);
	if (parsed === undefined) {
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await setSpecStatus(paths, parsed.id, parsed.status, today());
		if (!options.quiet) {
			write(io.stdout, `Updated ${result.spec.id} ${result.spec.title}\n`);
			write(io.stdout, `Status: ${result.previousStatus} -> ${result.spec.status}\n`);
			write(io.stdout, `Path: ${formatPath(paths, result.spec.filePath)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runSpecDelete(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length !== 1) {
		write(io.stderr, 'Usage: sundial spec delete <id>\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		const result = await deleteSpec(paths, args[0]);
		if (!options.quiet) {
			write(io.stdout, `Deleted ${result.spec.id} ${result.spec.title}\n`);
			write(io.stdout, `Path: ${formatPath(paths, result.spec.filePath)}\n`);
		}
	} catch (error) {
		writeError(error, io);
	}
}

async function runSpecLanes(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	if (args.length > 0) {
		write(io.stderr, 'Usage: sundial spec lanes\n');
		io.exitCode = 64;
		return;
	}

	const paths = await requireStore(options.cwd, io);
	if (paths === undefined || options.quiet) {
		return;
	}

	for (const lane of await readSpecLanes(paths)) {
		write(io.stdout, `${lane}\n`);
	}
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

	const vocabulary = await readDomainVocabulary(paths.domains);
	const unknownDomain = unknownQueryDomain(vocabulary.domains, parsed.domains);

	if (unknownDomain !== undefined) {
		write(io.stderr, `Unknown domain "${unknownDomain}".\n`);
		io.exitCode = 1;
		return;
	}

	const records = await listDecisionRecords(paths, 'accepted');
	const matches = records.filter(record => recordMatches(record, parsed.domains));

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

	if (options.quiet) {
		return;
	}

	renderRecordList(records, io);
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
		const result = await promoteDecisionRecord(paths, await readDomainVocabulary(paths.domains), parsed.id, from, today());
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
): { readonly domains: readonly string[] } | undefined {
	const domains: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--domain') {
			const value = args[index + 1];
			if (value === undefined || !isValidRecordDomain(value)) {
				return usageError(retrieveUsage(), io);
			}

			domains.push(value);
			index += 1;
			continue;
		}

		return usageError(retrieveUsage(), io);
	}

	return { domains: [...new Set(domains)] };
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
): { readonly status: DecisionRecordStatus | undefined } | undefined {
	let status: DecisionRecordStatus | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === '--status') {
			const value = args[index + 1];
			if (!isDecisionRecordStatus(value)) {
				return usageError('Usage: sundial dr list [--status candidate|accepted|rejected|retired]\n', io);
			}

			status = value;
			index += 1;
			continue;
		}

		return usageError('Usage: sundial dr list [--status candidate|accepted|rejected|retired]\n', io);
	}

	return { status };
}

function parseCandidateCreateArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): {
	readonly title: string;
	readonly domain: string;
	readonly decision: string | undefined;
	readonly pitfalls: string | undefined;
	readonly appendix: string | undefined;
	readonly proposedDomainDescription: string | undefined;
	readonly references: readonly string[];
} | undefined {
	let title: string | undefined;
	let domain = 'all';
	let domainSetBy: 'domain' | 'proposed-domain' | undefined;
	let decision: string | undefined;
	let pitfalls: string | undefined;
	let appendix: string | undefined;
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

		if (arg === '--pitfalls') {
			if (value === undefined) {
				return usageError(candidateCreateUsage(), io);
			}

			pitfalls = value;
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

	const decisionTrimmed = decision?.trim();
	const pitfallsTrimmed = pitfalls?.trim();
	const hasDecision = decisionTrimmed !== undefined && decisionTrimmed.length > 0;
	const hasPitfalls = pitfallsTrimmed !== undefined && pitfallsTrimmed.length > 0;

	if (title === undefined || (!hasDecision && !hasPitfalls)) {
		return usageError(candidateCreateUsage(), io);
	}

	return {
		title,
		domain,
		decision: hasDecision ? decisionTrimmed : undefined,
		pitfalls: hasPitfalls ? pitfallsTrimmed : undefined,
		appendix: appendix?.trim() || undefined,
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

function parseSpecCreateArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly title: string; readonly status: string | undefined } | undefined {
	let title: string | undefined;
	let status: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];

		if (arg === '--title') {
			if (value === undefined) {
				return usageError(specCreateUsage(), io);
			}

			title = value;
			index += 1;
			continue;
		}

		if (arg === '--status') {
			if (value === undefined) {
				return usageError(specCreateUsage(), io);
			}

			status = value;
			index += 1;
			continue;
		}

		return usageError(specCreateUsage(), io);
	}

	if (title === undefined || title.trim().length === 0) {
		return usageError(specCreateUsage(), io);
	}

	return {
		title: title.trim(),
		status: status?.trim() || undefined,
	};
}

function parseSpecListArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly status: string | undefined } | undefined {
	let status: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];
		if (arg === '--status') {
			if (value === undefined || value.trim().length === 0) {
				return usageError('Usage: sundial spec list [--status <status>]\n', io);
			}

			status = value.trim();
			index += 1;
			continue;
		}

		return usageError('Usage: sundial spec list [--status <status>]\n', io);
	}

	return { status };
}

function parseSpecStatusArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly id: string; readonly status: string } | undefined {
	if (args.length !== 2 || args[0].trim().length === 0 || args[1].trim().length === 0) {
		return usageError('Usage: sundial spec status <id> <status>\n', io);
	}

	return { id: args[0].trim(), status: args[1].trim() };
}

function requireKnownSpecStatus(status: string, statuses: readonly string[]): void {
	if (!statuses.includes(status)) {
		throw new Error(`Unknown spec status "${status}". Known statuses: ${statuses.join(', ')}.`);
	}
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

function candidateCreateUsage(): string {
	return 'Usage: sundial candidate create --title <title> [--domain <domain> | --proposed-domain <domain> <description>] (--decision <text> | --pitfalls <text> | --decision <text> --pitfalls <text>) [--appendix <text>] [--ref <ref>]\n';
}

function specCreateUsage(): string {
	return 'Usage: sundial spec create --title <title> [--status <lane>]\n';
}

function retrieveUsage(): string {
	return 'Usage: sundial dr retrieve [--domain <domain>]...\n';
}

async function renderDecisionRecordGuidance(): Promise<string> {
	const body = await readSundialInstructions();
	return `Decision Record Workflow\n========================\n\n${body}\n`;
}

function retrieveHelp(): string {
	return `Usage: sundial dr retrieve [--domain <domain>]...

Retrieve visible accepted Decision Records.

Options:
  --domain <domain>  Filter by domain. Repeat for each relevant domain in a single call. Each domain matches itself, its ancestors, and its descendants. Omit to match every domain.
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

	if (detail === 'medium') {
		renderOptionalSection(record, 'Decision', 'Decision', io);
		renderOptionalSection(record, 'Pitfalls', 'Pitfalls', io);
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

function recordMatches(record: DecisionRecord, domains: readonly string[]): boolean {
	return getRecordEnabled(record) && recordMatchesAnyDomain(record, domains);
}

function recordMatchesAnyDomain(record: DecisionRecord, domains: readonly string[]): boolean {
	if (domains.length === 0 || domains.includes('all')) {
		return true;
	}

	return domains.some(domain => recordMatchesDomain(record, domain));
}

function recordMatchesDomain(record: DecisionRecord, domain: string): boolean {
	const recordDomain = getRecordDomain(record);
	if (recordDomain === 'all') {
		return true;
	}

	return recordDomain === domain
		|| recordDomain.startsWith(`${domain}.`)
		|| domain.startsWith(`${recordDomain}.`);
}

function formatRecordListItem(record: DecisionRecord): string {
	return `${getRecordId(record)} ${getRecordTitle(record)} Domain: ${getRecordDomain(record)}`;
}

function formatSpecListItem(spec: SpecRecord): string {
	return `${spec.id} ${spec.title} Status: ${spec.status}`;
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

	const vocabulary = await readDomainVocabulary(paths.domains);
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

		write(io.stdout, `Updated Sundial files at ${result.paths.root}\n`);
		if (result.paths.folder !== '.') {
			write(io.stdout, `Configured folder: ${result.paths.folder}\n`);
		}
		renderPathGroup('Created', result.created, io);
		renderPathGroup('Already current', result.existing, io);
		renderPathGroup('Updated', result.updated, io);
	} catch (error) {
		writeError(error, io);
	}
}

interface ParsedUpdateArgs {
	readonly root?: string;
	readonly folder?: string;
	readonly claude: boolean;
	readonly codex: boolean;
}

function parseUpdateArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): ParsedUpdateArgs | undefined {
	let root: string | undefined;
	let folder: string | undefined;
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

		if (arg === '--folder') {
			const value = args[index + 1];
			if (value === undefined) {
				return updateUsageError(io);
			}

			folder = value;
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

	if (!claude && !codex && folder === undefined) {
		return updateUsageError(io);
	}

	return { root, folder, claude, codex };
}

function updateUsageError(io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): undefined {
	write(io.stderr, 'Usage: sundial update [--root <path>] [--folder <relative-path>] [--claude] [--codex]\n');
	io.exitCode = 64;
	return undefined;
}

function parseArguments(argv: readonly string[], defaultCwd: string): CliOptions {
	const command: string[] = [];
	let cwd = defaultCwd;
	let quiet = false;
	let noSessionLog = false;
	let version = false;

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

		if (arg === '--version') {
			version = true;
			continue;
		}

		command.push(arg);
	}

	return { cwd, quiet, noSessionLog, version, command };
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
		folder: parsed.folder,
	});

	if (options.quiet) {
		return;
	}

	write(io.stdout, `Initialized Sundial store at ${result.paths.store}\n`);
	if (result.paths.folder !== '.') {
		write(io.stdout, `Configured folder: ${result.paths.folder}\n`);
	}

	if (!parsed.claude && !parsed.codex) {
		write(io.stdout, 'Agent runtime installation skipped. Pass --claude, --codex, or both to install runtime assets.\n');
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
	readonly folder?: string;
	readonly claude: boolean;
	readonly codex: boolean;
}

function parseInitArgs(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): ParsedInitArgs | undefined {
	let root: string | undefined;
	let folder: string | undefined;
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

		if (arg === '--folder') {
			const value = args[index + 1];
			if (value === undefined) {
				return initUsageError(io);
			}

			folder = value;
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

	return { root, folder, claude, codex };
}

function initUsageError(io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): undefined {
	write(io.stderr, 'Usage: sundial init --root <path> [--folder <relative-path>] [--claude] [--codex]\n');
	io.exitCode = 64;
	return undefined;
}

async function runDomains(
	options: CliOptions,
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stdout' | 'stderr' | 'exitCode'>,
): Promise<void> {
	const invocation = parseDomainsInvocation(args, io);
	if (invocation === undefined) {
		return;
	}
	const paths = await requireStore(options.cwd, io);
	if (paths === undefined) {
		return;
	}

	try {
		switch (invocation.kind) {
			case 'list':
				if (invocation.json) {
					const result = await readDomainsJson(paths.domains);
					if (!options.quiet) {
						write(io.stdout, `${JSON.stringify(result, undefined, 2)}\n`);
					}
					return;
				}

				const vocabulary = await readDomainVocabulary(paths.domains);
				if (!validateVocabularyForListing(vocabulary.errors, io) || options.quiet) {
					return;
				}
				write(io.stdout, 'Domains:\n');
				renderDomainDefinitions(vocabulary.domains, io);
				return;
			case 'add':
				await addDomain(paths.domains, invocation.name, invocation.description);
				if (!options.quiet) {
					write(io.stdout, `Added domain ${invocation.name}.\n`);
				}
				return;
			case 'update': {
				const updatedVocabulary = await updateDomain(paths.domains, invocation.currentName, invocation);
				const resultingName = updatedVocabulary.domains.find(
					domain => domain.name === (invocation.name ?? invocation.currentName),
				)?.name ?? invocation.name ?? invocation.currentName;
				if (!options.quiet) {
					write(io.stdout, `Updated domain ${resultingName}.\n`);
				}
				return;
			}
			case 'remove':
				await removeDomain(paths.domains, invocation.name);
				if (!options.quiet) {
					write(io.stdout, `Removed domain ${invocation.name}.\n`);
				}
				return;
		}
	} catch (error) {
		write(io.stderr, `${error instanceof Error ? error.message : String(error)}\n`);
		io.exitCode = 1;
	}
}

type DomainsInvocation =
	| { readonly kind: 'list'; readonly json: boolean }
	| { readonly kind: 'add'; readonly name: string; readonly description: string }
	| { readonly kind: 'update'; readonly currentName: string; readonly name?: string; readonly description?: string }
	| { readonly kind: 'remove'; readonly name: string };

function parseDomainsInvocation(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): DomainsInvocation | undefined {
	if (args.length === 0) {
		return { kind: 'list', json: false };
	}
	if (args.length === 1 && args[0] === '--json') {
		return { kind: 'list', json: true };
	}
	const [subcommand, ...subcommandArgs] = args;
	if (subcommand === 'add') {
		const parsed = parseDomainAdd(subcommandArgs, io);
		return parsed === undefined ? undefined : { kind: 'add', ...parsed };
	}
	if (subcommand === 'update') {
		const parsed = parseDomainUpdate(subcommandArgs, io);
		return parsed === undefined ? undefined : { kind: 'update', ...parsed };
	}
	if (subcommand === 'remove' && subcommandArgs.length === 1) {
		return { kind: 'remove', name: subcommandArgs[0] };
	}
	return domainsUsageError(io);
}

function parseDomainAdd(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly name: string; readonly description: string } | undefined {
	let name: string | undefined;
	let description: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index + 1];
		if (args[index] === '--name' && value !== undefined && name === undefined) {
			name = value;
			index += 1;
		} else if (args[index] === '--description' && value !== undefined && description === undefined) {
			description = value;
			index += 1;
		} else {
			return domainsUsageError(io);
		}
	}
	return name === undefined || description === undefined ? domainsUsageError(io) : { name, description };
}

function parseDomainUpdate(
	args: readonly string[],
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): { readonly currentName: string; readonly name?: string; readonly description?: string } | undefined {
	const [currentName, ...options] = args;
	if (currentName === undefined || currentName.startsWith('--')) {
		return domainsUsageError(io);
	}
	let name: string | undefined;
	let description: string | undefined;
	for (let index = 0; index < options.length; index += 1) {
		const value = options[index + 1];
		if (options[index] === '--name' && value !== undefined && name === undefined) {
			name = value;
			index += 1;
		} else if (options[index] === '--description' && value !== undefined && description === undefined) {
			description = value;
			index += 1;
		} else {
			return domainsUsageError(io);
		}
	}
	return name === undefined && description === undefined
		? domainsUsageError(io)
		: { currentName, ...(name === undefined ? {} : { name }), ...(description === undefined ? {} : { description }) };
}

function domainsUsageError(io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>): undefined {
	write(io.stderr, [
		'Usage:',
		'  sundial domains [--json]',
		'  sundial domains add --name <name> --description <description>',
		'  sundial domains update <current-name> [--name <new-name>] [--description <description>]',
		'  sundial domains remove <name>',
		'',
	].join('\n'));
	io.exitCode = 64;
	return undefined;
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

function renderDomainDefinitions(
	definitions: readonly DomainDefinition[],
	io: Pick<NodeJS.Process, 'stdout'>,
): void {
	if (definitions.length === 0) {
		write(io.stdout, 'No domains defined.\n');
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

function unknownQueryDomain(domains: readonly DomainDefinition[], queryDomains: readonly string[]): string | undefined {
	if (queryDomains.length === 0 || domains.length === 0) {
		return undefined;
	}

	const knownDomains = new Set(domains.map(item => item.name));
	knownDomains.add('all');
	return queryDomains.find(domain => !knownDomains.has(domain));
}

async function requireStore(
	cwd: string,
	io: Pick<NodeJS.Process, 'stderr' | 'exitCode'>,
): Promise<StorePaths | undefined> {
	const paths = await discoverStore(cwd);

	if (paths === undefined) {
		write(io.stderr, 'No sundial store found. Run sundial init --root <path> first.\n');
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
		write(io.stderr, `No sundial store found at ${paths.root}. Run sundial init --root ${paths.root} first.\n`);
		io.exitCode = 1;
		return undefined;
	}

	return await loadStorePaths(root);
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
