import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { Writable } from 'node:stream';
import { bootstrapCommand, main, runBootstrapCommand } from '../main';
import { initStore } from '../core/store';

describe('bootstrapCommand', () => {
	test('runs Codex bootstrap in bounded full-auto mode', () => {
		const command = bootstrapCommand('codex', '/project', 'bootstrap prompt');

		assert.equal(command.file, 'codex');
		assert.deepEqual(command.args, [
			'exec',
			'--cd',
			'/project',
			'--full-auto',
			'--skip-git-repo-check',
			'bootstrap prompt',
		]);
		assert.equal(command.args.includes('--ask-for-approval'), false);
		assert.equal(command.args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
	});

	test('streams bootstrap output while the child process is running', async () => {
		let stdout = '';
		let stderr = '';
		let resolveFirstStdout: () => void = () => undefined;
		const firstStdout = new Promise<void>(resolve => {
			resolveFirstStdout = resolve;
		});
		const io = {
			stdout: new Writable({
				write(chunk, _encoding, callback) {
					stdout += chunk.toString();
					resolveFirstStdout();
					callback();
				},
			}),
			stderr: new Writable({
				write(chunk, _encoding, callback) {
					stderr += chunk.toString();
					callback();
				},
			}),
		};
		const run = runBootstrapCommand({
			file: process.execPath,
			args: [
				'-e',
				'process.stdout.write("ready\\n"); setTimeout(() => process.stderr.write("done\\n"), 50);',
			],
		}, process.cwd(), io);

		await Promise.race([
			firstStdout,
			new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Timed out waiting for stdout stream.')), 1000)),
		]);

		assert.equal(stdout, 'ready\n');
		await run;
		assert.equal(stderr, 'done\n');
	});

	test('retrieves accepted DRs by hierarchical domain', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-domain-retrieve-'));
		const init = await initStore(root);
		const accepted = path.join(init.paths.store, 'drs', 'accepted');
		await fs.writeFile(init.paths.domains, [
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### all',
			'',
			'Global guidance.',
			'',
			'### cli',
			'',
			'CLI guidance.',
			'',
			'### vscode',
			'',
			'VS Code guidance.',
			'',
			'### vscode.extension',
			'',
			'VS Code extension guidance.',
			'',
			'### vscode.webview',
			'',
			'VS Code webview guidance.',
			'',
			'### vscode.webview.ui',
			'',
			'VS Code webview UI guidance.',
			'',
		].join('\n'), 'utf8');

		await fs.writeFile(path.join(accepted, 'DR-0001-global.md'), acceptedRecord({
			id: 'DR-0001',
			title: 'Global architecture',
			domain: undefined,
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0002-cli-retrieve.md'), acceptedRecord({
			id: 'DR-0002',
			title: 'CLI retrieve',
			domain: 'cli.retrieve',
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0003-ui.md'), acceptedRecord({
			id: 'DR-0003',
			title: 'UI architecture',
			domain: 'ui',
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0006-vscode.md'), acceptedRecord({
			id: 'DR-0006',
			title: 'VS Code broad',
			domain: 'vscode',
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0007-vscode-webview.md'), acceptedRecord({
			id: 'DR-0007',
			title: 'VS Code webview',
			domain: 'vscode.webview',
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0008-vscode-webview-ui.md'), acceptedRecord({
			id: 'DR-0008',
			title: 'VS Code webview UI',
			domain: 'vscode.webview.ui',
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0009-vscode-extension.md'), acceptedRecord({
			id: 'DR-0009',
			title: 'VS Code extension',
			domain: 'vscode.extension',
		}), 'utf8');

		const result = await runCli(root, ['dr', 'retrieve', '--domain', 'cli']);

		assert.match(result.stdout, /DR-0001 Global architecture/);
		assert.match(result.stdout, /Domain: all/);
		assert.match(result.stdout, /Decision:\nFollow Global architecture\./);
		assert.match(result.stdout, /DR-0002 CLI retrieve/);
		assert.doesNotMatch(result.stdout, /DR-0003 UI architecture/);
		assert.doesNotMatch(result.stdout, /^Status:/m);
		assert.doesNotMatch(result.stdout, /^Path:/m);
		assert.equal(result.stderr, '');
		assert.equal(result.exitCode, undefined);

		const parentDomainResult = await runCli(root, ['dr', 'retrieve', '--domain', 'vscode']);
		assert.match(parentDomainResult.stdout, /DR-0006 VS Code broad/);
		assert.match(parentDomainResult.stdout, /DR-0007 VS Code webview/);
		assert.match(parentDomainResult.stdout, /DR-0008 VS Code webview UI/);
		assert.match(parentDomainResult.stdout, /DR-0009 VS Code extension/);

		const childDomainResult = await runCli(root, ['dr', 'retrieve', '--domain', 'vscode.webview']);
		assert.match(childDomainResult.stdout, /DR-0006 VS Code broad/);
		assert.match(childDomainResult.stdout, /DR-0007 VS Code webview/);
		assert.match(childDomainResult.stdout, /DR-0008 VS Code webview UI/);
		assert.doesNotMatch(childDomainResult.stdout, /DR-0009 VS Code extension/);

		const grandchildDomainResult = await runCli(root, ['dr', 'retrieve', '--domain', 'vscode.webview.ui']);
		assert.match(grandchildDomainResult.stdout, /DR-0006 VS Code broad/);
		assert.match(grandchildDomainResult.stdout, /DR-0007 VS Code webview/);
		assert.match(grandchildDomainResult.stdout, /DR-0008 VS Code webview UI/);
		assert.doesNotMatch(grandchildDomainResult.stdout, /DR-0009 VS Code extension/);
	});

	test('does not expose the removed context command', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-context-removed-'));

		const result = await runCli(root, ['context', '--domain', 'cli']);

		assert.equal(result.stdout, '');
		assert.match(result.stderr, /Unknown command: context/);
		assert.doesNotMatch(result.stderr, /context\s+Retrieve agent-ready DR context/);
		assert.equal(result.exitCode, 64);
	});

	test('does not expose the removed tags command or tag flags', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-tags-removed-'));
		await initStore(root);

		const tags = await runCli(root, ['tags']);
		const retrieveTag = await runCli(root, ['dr', 'retrieve', '--tag', 'architecture']);
		const listTag = await runCli(root, ['dr', 'list', '--tag', 'architecture']);

		assert.equal(tags.stdout, '');
		assert.match(tags.stderr, /Unknown command: tags/);
		assert.equal(tags.exitCode, 64);
		assert.match(retrieveTag.stderr, /Usage: sundial dr retrieve/);
		assert.equal(retrieveTag.exitCode, 64);
		assert.match(listTag.stderr, /Usage: sundial dr list/);
		assert.equal(listTag.exitCode, 64);
	});

	test('lists known domains from the vocabulary', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-domains-list-'));
		await initStore(root);

		const result = await runCli(root, ['domains']);

		assert.match(result.stdout, /Domains:\n/);
		assert.match(result.stdout, /all - Global guidance/);
		assert.match(result.stdout, /cli - Command-line behavior/);
		assert.doesNotMatch(result.stdout, /Tags:/);
		assert.equal(result.stderr, '');
		assert.equal(result.exitCode, undefined);
	});

	test('reports validation state from the status command', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-status-validation-'));
		const init = await initStore(root);
		await fs.writeFile(path.join(init.paths.store, 'drs', 'accepted', 'DR-0001-invalid-domain.md'), acceptedRecord({
			id: 'DR-0001',
			title: 'Invalid domain',
			domain: 'api',
		}), 'utf8');

		const result = await runCli(root, ['status']);

		assert.match(result.stdout, /Sundial store:/);
		assert.match(result.stdout, /Accepted DRs: 1/);
		assert.match(result.stdout, /DR-0001-invalid-domain\.md/);
		assert.match(result.stdout, /error: Unknown domain "api"\./);
		assert.match(result.stdout, /Validation: 1 error, 0 warnings\./);
		assert.doesNotMatch(result.stdout, /^Tags:/m);
		assert.equal(result.stderr, '');
		assert.equal(result.exitCode, 1);
	});

	test('does not expose removed validation and audit subcommands', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-command-surface-removed-'));
		await initStore(root);

		const validate = await runCli(root, ['validate']);
		const audit = await runCli(root, ['audit']);
		const drValidate = await runCli(root, ['dr', 'validate', '--all']);

		assert.equal(validate.stdout, '');
		assert.match(validate.stderr, /Unknown command: validate/);
		assert.equal(validate.exitCode, 64);
		assert.equal(audit.stdout, '');
		assert.match(audit.stderr, /Unknown command: audit/);
		assert.equal(audit.exitCode, 64);
		assert.equal(drValidate.stdout, '');
		assert.match(drValidate.stderr, /Usage: sundial dr \(retrieve \| get \| list \| enable \| disable \| retire \| promote \| delete\)/);
		assert.doesNotMatch(drValidate.stderr, /dr validate/);
		assert.equal(drValidate.exitCode, 64);
	});

	test('updates generated skill files with one command', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-update-'));
		await initStore(root, { codex: true });
		const designSkillPath = path.join(root, '.agents', 'skills', 'decision-aware-design', 'SKILL.md');
		const implementSkillPath = path.join(root, '.agents', 'skills', 'decision-aware-implement', 'SKILL.md');
		await fs.writeFile(designSkillPath, 'custom design skill\n', 'utf8');
		await fs.writeFile(implementSkillPath, 'custom implement skill\n', 'utf8');

		const result = await runCli(root, ['update', '--codex']);
		const designSkillContents = await fs.readFile(designSkillPath, 'utf8');
		const implementSkillContents = await fs.readFile(implementSkillPath, 'utf8');

		assert.match(result.stdout, /Updated Sundial skill files/);
		assert.match(result.stdout, /\.agents\/skills\/decision-aware-design\/SKILL\.md/);
		assert.match(result.stdout, /\.agents\/skills\/decision-aware-implement\/SKILL\.md/);
		assert.doesNotMatch(result.stdout, /\.agents\/agents\/decision-aware-design-review\.md/);
		assert.match(designSkillContents, /name: decision-aware-design/);
		assert.match(implementSkillContents, /name: decision-aware-implement/);
		assert.equal(result.stderr, '');
	});

	test('updates generated skill files from a nested project directory', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-update-nested-'));
		await initStore(root, { codex: true });
		const nested = path.join(root, 'src', 'nested');
		await fs.mkdir(nested, { recursive: true });
		const designSkillPath = path.join(root, '.agents', 'skills', 'decision-aware-design', 'SKILL.md');
		await fs.writeFile(designSkillPath, 'custom design skill\n', 'utf8');

		const result = await runCli(nested, ['update', '--codex']);
		const designSkillContents = await fs.readFile(designSkillPath, 'utf8');

		assert.match(result.stdout, /Updated Sundial skill files/);
		assert.match(result.stdout, /\.agents\/skills\/decision-aware-design\/SKILL\.md/);
		assert.match(designSkillContents, /name: decision-aware-design/);
		assert.equal(result.stderr, '');
	});

	test('disables accepted DRs from retrieval and can enable them again', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-disable-retrieve-'));
		const init = await initStore(root);
		const accepted = path.join(init.paths.store, 'drs', 'accepted');
		await fs.writeFile(path.join(accepted, 'DR-0001-toggle.md'), acceptedRecord({
			id: 'DR-0001',
			title: 'Toggle retrieval',
			domain: 'cli',
		}), 'utf8');

		const disabled = await runCli(root, ['dr', 'disable', 'DR-0001']);
		const disabledRetrieve = await runCli(root, ['dr', 'retrieve', '--domain', 'cli']);
		const disabledGet = await runCli(root, ['dr', 'get', 'DR-0001']);
		const enabled = await runCli(root, ['dr', 'enable', 'DR-0001']);
		const enabledRetrieve = await runCli(root, ['dr', 'retrieve', '--domain', 'cli']);

		assert.match(disabled.stdout, /Disabled DR-0001/);
		assert.doesNotMatch(disabledRetrieve.stdout, /DR-0001 Toggle retrieval/);
		assert.match(disabledGet.stdout, /enabled: false/);
		assert.match(enabled.stdout, /Enabled DR-0001/);
		assert.match(enabledRetrieve.stdout, /DR-0001 Toggle retrieval/);
	});

	test('groups DR lists by lifecycle state with domain on each row', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-dr-list-groups-'));
		const init = await initStore(root);
		const drs = path.join(init.paths.store, 'drs');
		await fs.writeFile(path.join(drs, 'rejected', 'DR-0001-rejected.md'), acceptedRecord({
			id: 'DR-0001',
			title: 'Rejected record',
			domain: 'cli',
		}).replace('status: accepted', 'status: rejected'), 'utf8');
		await fs.writeFile(path.join(drs, 'candidates', 'CAND-0001-candidate.md'), acceptedRecord({
			id: 'CAND-0001',
			title: 'Candidate record',
			domain: 'governance',
		}).replace('status: accepted', 'status: candidate'), 'utf8');
		await fs.writeFile(path.join(drs, 'retired', 'DR-0002-retired.md'), acceptedRecord({
			id: 'DR-0002',
			title: 'Retired record',
			domain: 'cli',
		}).replace('status: accepted', 'status: retired'), 'utf8');
		await fs.writeFile(path.join(drs, 'accepted', 'DR-0003-active.md'), acceptedRecord({
			id: 'DR-0003',
			title: 'Active record',
			domain: 'cli',
		}), 'utf8');
		await fs.writeFile(path.join(drs, 'accepted', 'DR-0004-hidden.md'), acceptedRecord({
			id: 'DR-0004',
			title: 'Hidden record',
			domain: 'cli',
			enabled: false,
		}), 'utf8');

		const result = await runCli(root, ['dr', 'list']);

		assert.match(result.stdout, /Rejected:\nDR-0001 Rejected record Domain: cli/);
		assert.match(result.stdout, /Candidate:\nCAND-0001 Candidate record Domain: governance/);
		assert.match(result.stdout, /Retired:\nDR-0002 Retired record Domain: cli/);
		assert.match(result.stdout, /Active:\nDR-0003 Active record Domain: cli/);
		assert.match(result.stdout, /Active\(hidden\):\nDR-0004 Hidden record Domain: cli/);
		assert.doesNotMatch(result.stdout, /Tags:/);
		assert.ok(result.stdout.indexOf('Rejected:') < result.stdout.indexOf('Candidate:'));
		assert.ok(result.stdout.indexOf('Candidate:') < result.stdout.indexOf('Retired:'));
		assert.ok(result.stdout.indexOf('Retired:') < result.stdout.indexOf('Active:'));
		assert.ok(result.stdout.indexOf('Active:') < result.stdout.indexOf('Active(hidden):'));
		assert.doesNotMatch(result.stdout, /\((accepted|candidate|rejected|retired)\)/);
		assert.equal(result.stderr, '');
		assert.equal(result.exitCode, undefined);
	});

	test('retires and promotes accepted DRs', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-dr-promote-'));
		const init = await initStore(root);
		const accepted = path.join(init.paths.store, 'drs', 'accepted');
		await fs.writeFile(path.join(accepted, 'DR-0001-retired.md'), acceptedRecord({
			id: 'DR-0001',
			title: 'Retired record',
			domain: 'cli',
		}), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0002-no-replacement.md'), acceptedRecord({
			id: 'DR-0002',
			title: 'No replacement',
			domain: 'cli',
		}), 'utf8');

		const retired = await runCli(root, ['dr', 'retire', 'DR-0001', '--by', 'DR-0003']);
		const retiredWithoutReplacement = await runCli(root, ['dr', 'retire', 'DR-0002']);
		const acceptedAfterRetire = await runCli(root, ['dr', 'list', '--status', 'accepted']);
		const retiredList = await runCli(root, ['dr', 'list', '--status', 'retired']);
		const promoted = await runCli(root, ['dr', 'promote', 'DR-0001', '--from', 'retired']);
		const acceptedAfterPromote = await runCli(root, ['dr', 'list', '--status', 'accepted']);
		const retiredWithoutReplacementMarkdown = await fs.readFile(path.join(init.paths.store, 'drs', 'retired', 'DR-0002-no-replacement.md'), 'utf8');

		assert.match(retired.stdout, /Retired DR-0001 by DR-0003/);
		assert.match(retiredWithoutReplacement.stdout, /Retired DR-0002/);
		assert.doesNotMatch(acceptedAfterRetire.stdout, /DR-0001/);
		assert.doesNotMatch(acceptedAfterRetire.stdout, /DR-0002/);
		assert.match(retiredList.stdout, /Retired:\nDR-0001 Retired record Domain: cli/);
		assert.match(retiredList.stdout, /DR-0002 No replacement Domain: cli/);
		assert.doesNotMatch(retiredList.stdout, /\(retired\)/);
		assert.doesNotMatch(retiredWithoutReplacementMarkdown, /retired_by/);
		assert.match(promoted.stdout, /Promoted DR-0001 as DR-0001/);
		assert.match(acceptedAfterPromote.stdout, /Active:\nDR-0001 Retired record Domain: cli/);
		assert.doesNotMatch(acceptedAfterPromote.stdout, /\(accepted\)/);
	});

	test('promotes rejected DR candidates as accepted DRs', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-rejected-promote-'));
		await initStore(root);

		await runCli(root, [
			'candidate',
			'create',
			'--title',
			'Rejected candidate',
			'--domain',
			'cli',
			'--decision',
			'Accepted after rejection.',
		]);
		await runCli(root, ['candidate', 'reject', 'CAND-0001', '--reason', 'Deferred.']);
		const promoted = await runCli(root, ['dr', 'promote', 'CAND-0001', '--from', 'rejected']);
		const accepted = await runCli(root, ['dr', 'list', '--status', 'accepted']);
		const rejected = await runCli(root, ['dr', 'list', '--status', 'rejected']);

		assert.match(promoted.stdout, /Promoted CAND-0001 as DR-0001/);
		assert.match(accepted.stdout, /Active:\nDR-0001 Rejected candidate Domain: cli/);
		assert.doesNotMatch(accepted.stdout, /\(accepted\)/);
		assert.doesNotMatch(rejected.stdout, /CAND-0001/);
	});

	test('deletes rejected and retired DR files', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-dr-delete-'));
		const init = await initStore(root);
		const rejected = path.join(init.paths.store, 'drs', 'rejected');
		const retired = path.join(init.paths.store, 'drs', 'retired');
		const rejectedPath = path.join(rejected, 'DR-0001-rejected.md');
		const retiredPath = path.join(retired, 'DR-0002-retired.md');
		await fs.writeFile(rejectedPath, acceptedRecord({
			id: 'DR-0001',
			title: 'Rejected record',
			domain: 'cli',
		}).replace('status: accepted', 'status: rejected'), 'utf8');
		await fs.writeFile(retiredPath, acceptedRecord({
			id: 'DR-0002',
			title: 'Retired record',
			domain: 'cli',
		}).replace('status: accepted', 'status: retired'), 'utf8');

		const deletedRejected = await runCli(root, ['dr', 'delete', 'DR-0001', '--from', 'rejected']);
		const deletedRetired = await runCli(root, ['dr', 'delete', 'DR-0002']);
		const rejectedList = await runCli(root, ['dr', 'list', '--status', 'rejected']);
		const retiredList = await runCli(root, ['dr', 'list', '--status', 'retired']);

		assert.match(deletedRejected.stdout, /Deleted DR-0001 Rejected record \(rejected\)/);
		assert.match(deletedRejected.stdout, /\.sundial\/drs\/rejected\/DR-0001-rejected\.md/);
		assert.match(deletedRetired.stdout, /Deleted DR-0002 Retired record \(retired\)/);
		assert.equal(rejectedList.stdout, '');
		assert.equal(retiredList.stdout, '');
		await assert.rejects(fs.access(rejectedPath));
		await assert.rejects(fs.access(retiredPath));
	});

	test('cats raw DR markdown by id', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-appendix-'));
		const init = await initStore(root);
		const accepted = path.join(init.paths.store, 'drs', 'accepted');
		const markdown = acceptedRecord({
			id: 'DR-0001',
			title: 'Appendix',
			domain: 'cli',
			appendix: 'This explains background context for human reviewers.',
		});
		const malformed = '---\nid: DR-0002\ntitle: Broken frontmatter\n---\n## Decision\n\nInspect raw files.\n';
		await fs.writeFile(path.join(accepted, 'DR-0001-appendix.md'), markdown, 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0002-broken.md'), malformed, 'utf8');

		const shown = await runCli(root, ['dr', 'get', 'DR-0001']);
		const broken = await runCli(root, ['dr', 'get', 'DR-0002']);
		const detail = await runCli(root, ['dr', 'get', 'DR-0001', '--detail', 'full']);

		assert.equal(shown.stdout, markdown);
		assert.equal(shown.stderr, '');
		assert.equal(broken.stdout, malformed);
		assert.equal(broken.stderr, '');
		assert.equal(detail.stdout, '');
		assert.match(detail.stderr, /Usage: sundial dr get <id> \[<id>\]/);
		assert.equal(detail.exitCode, 64);
	});

	test('rejects removed candidate section file flags', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-removed-section-files-'));
		await initStore(root);

		const rationale = await runCli(root, [
			'candidate',
			'create',
			'--title',
			'Rationale candidate',
			'--decision',
			'Use terse candidate decisions.',
			'--rationale-file',
			'rationale.md',
		]);
		const appendix = await runCli(root, [
			'candidate',
			'create',
			'--title',
			'Appendix candidate',
			'--decision',
			'Use terse candidate decisions.',
			'--appendix-file',
			'appendix.md',
		]);

		assert.match(rationale.stderr, /Usage: sundial candidate create/);
		assert.match(appendix.stderr, /Usage: sundial candidate create/);
		assert.doesNotMatch(rationale.stderr, /rationale-file/);
		assert.doesNotMatch(appendix.stderr, /appendix-file/);
		assert.equal(rationale.exitCode, 64);
		assert.equal(appendix.exitCode, 64);
	});

	test('creates candidates with proposed domain syntax', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-proposed-domain-'));
		await initStore(root);

		const created = await runCli(root, [
			'candidate',
			'create',
			'--title',
			'Field keyed validation',
			'--proposed-domain',
			'api.validation',
			'API validation behavior.',
			'--decision',
			'Return field-keyed validation errors.',
			'--appendix',
			'For human reviewers: field-keyed means the response object is keyed by input field name.',
		]);
		const shown = await runCli(root, ['candidate', 'show', 'CAND-0001']);

		assert.match(created.stdout, /Created CAND-0001 Field keyed validation/);
		assert.match(created.stdout, /Proposed domains: api\.validation/);
		assert.doesNotMatch(created.stdout, /Proposed tags/);
		assert.match(shown.stdout, /domain: api\.validation/);
		assert.match(shown.stdout, /proposed_domains:\n  api\.validation: API validation behavior\./);
		assert.match(shown.stdout, /## Appendix\n\nFor human reviewers: field-keyed means the response object is keyed by input field name\./);
		assert.equal(created.stderr, '');
	});
});

function acceptedRecord(input: {
	readonly id: string;
	readonly title: string;
	readonly domain: string | undefined;
	readonly enabled?: boolean;
	readonly appendix?: string;
}): string {
	return [
		'---',
		`id: ${input.id}`,
		`title: ${input.title}`,
		'status: accepted',
		...(input.enabled === undefined ? [] : [`enabled: ${input.enabled ? 'true' : 'false'}`]),
		...(input.domain === undefined ? [] : [`domain: ${input.domain}`]),
		'created: 2026-05-03',
		'updated: 2026-05-03',
		'author: codex',
		'---',
		'',
		'## Decision',
		'',
		`Follow ${input.title}.`,
		...(input.appendix === undefined
			? []
			: ['', '## Appendix', '', input.appendix]),
		'',
	].join('\n');
}

async function runCli(root: string, args: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: string | number | undefined }> {
	let stdout = '';
	let stderr = '';
	const io = {
		cwd: () => root,
		stdout: new Writable({
			write(chunk, _encoding, callback) {
				stdout += chunk.toString();
				callback();
			},
		}),
		stderr: new Writable({
			write(chunk, _encoding, callback) {
				stderr += chunk.toString();
				callback();
			},
		}),
		exitCode: undefined,
	};

	await main(args, io as unknown as Pick<NodeJS.Process, 'cwd' | 'stdout' | 'stderr' | 'exitCode'>);
	return { stdout, stderr, exitCode: io.exitCode };
}
