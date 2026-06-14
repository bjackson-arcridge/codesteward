import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { countDecisionRecords, discoverStore, initStore, updateRuntimeAssets } from '../core/store';

describe('store bootstrap', () => {
	test('creates the store layout idempotently without runtime assets by default', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-store-'));
		const first = await initStore(root);
		const second = await initStore(root);

		assert.ok(first.created.includes('.sundial/config.json'));
		assert.ok(first.created.includes('.sundial/domains.md'));
		assert.ok(first.created.includes('.sundial/drs/retired'));
		assert.ok(first.created.includes('.sundial/drs/accepted/.gitkeep'));
		assert.ok(first.created.includes('.sundial/drs/candidates/.gitkeep'));
		assert.ok(first.created.includes('.sundial/drs/rejected/.gitkeep'));
		assert.ok(first.created.includes('.sundial/drs/retired/.gitkeep'));
		assert.equal(first.created.includes('AGENTS.md'), false);
		assert.ok(second.existing.includes('.sundial/config.json'));
		assert.ok(second.existing.includes('.sundial/drs/accepted/.gitkeep'));

		await fs.mkdir(path.join(root, 'src', 'nested'), { recursive: true });
		const discovered = await discoverStore(path.join(root, 'src', 'nested'));
		assert.equal(discovered?.root, root);
		assert.equal(await countDecisionRecords(first.paths, 'accepted'), 0);
		assert.equal(await fs.readFile(path.join(root, '.sundial', 'drs', 'accepted', '.gitkeep'), 'utf8'), 'Keep this DR lifecycle directory present in fresh git worktrees.\n');
		assert.rejects(fs.access(path.join(root, '.sundial', 'agent')));
	});

	test('bootstraps Claude Code assets in .claude when opted in', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-claude-'));
		const first = await initStore(root, { claude: true });
		const second = await initStore(root, { claude: true });

		assert.ok(first.created.includes('.claude/skills/decision-aware-design/SKILL.md'));
		assert.ok(first.created.includes('.claude/skills/decision-aware-implement/SKILL.md'));
		assert.ok(first.created.includes('.claude/CLAUDE.md'));
		assert.equal(first.created.includes('.claude/agents/decision-aware-design-review.md'), false);
		assert.equal(first.created.includes('.claude/agents/decision-aware-code-review.md'), false);
		assert.ok(second.existing.includes('.claude/CLAUDE.md'));

		const instructions = await fs.readFile(path.join(root, '.claude', 'CLAUDE.md'), 'utf8');
		const designSkill = await fs.readFile(path.join(root, '.claude', 'skills', 'decision-aware-design', 'SKILL.md'), 'utf8');
		const implementSkill = await fs.readFile(path.join(root, '.claude', 'skills', 'decision-aware-implement', 'SKILL.md'), 'utf8');
		assert.match(instructions, /sundial:agent-instructions/);
		assert.match(instructions, /sundial candidate create/);
		assert.equal(designSkill, await readTemplate('skills/claude/decision-aware-design/SKILL.md'));
		assert.equal(implementSkill, await readTemplate('skills/claude/decision-aware-implement/SKILL.md'));
		assert.doesNotMatch(instructions, /\{\{crHowTo\}\}/);
	});

	test('bootstraps Codex assets in .agents when opted in', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-codex-'));
		const first = await initStore(root, { codex: true });
		const second = await initStore(root, { codex: true });

		assert.ok(first.created.includes('.agents/skills/decision-aware-design/SKILL.md'));
		assert.ok(first.created.includes('.agents/skills/decision-aware-implement/SKILL.md'));
		assert.ok(first.created.includes('AGENTS.md'));
		assert.equal(first.created.includes('.agents/agents/decision-aware-design-review.md'), false);
		assert.equal(first.created.includes('.agents/agents/decision-aware-code-review.md'), false);
		assert.ok(second.existing.includes('AGENTS.md'));

		const instructions = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
		const designSkill = await fs.readFile(path.join(root, '.agents', 'skills', 'decision-aware-design', 'SKILL.md'), 'utf8');
		const implementSkill = await fs.readFile(path.join(root, '.agents', 'skills', 'decision-aware-implement', 'SKILL.md'), 'utf8');
		assert.match(instructions, /sundial:agent-instructions/);
		assert.match(instructions, /sundial candidate create/);
		assert.equal(designSkill, await readTemplate('skills/codex/decision-aware-design/SKILL.md'));
		assert.equal(implementSkill, await readTemplate('skills/codex/decision-aware-implement/SKILL.md'));
		assert.doesNotMatch(designSkill, /\{\{crHowTo\}\}/);
		assert.doesNotMatch(implementSkill, /\{\{crHowTo\}\}/);
	});

	test('can bootstrap Claude Code and Codex assets together', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-both-'));
		const result = await initStore(root, { claude: true, codex: true });

		assert.ok(result.created.includes('.claude/skills/decision-aware-design/SKILL.md'));
		assert.ok(result.created.includes('.agents/skills/decision-aware-design/SKILL.md'));
		assert.ok(result.created.includes('.claude/CLAUDE.md'));
		assert.ok(result.created.includes('AGENTS.md'));
	});

	test('updates all generated skill assets from templates', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-update-assets-'));
		await initStore(root, { codex: true });
		const designSkillPath = path.join(root, '.agents', 'skills', 'decision-aware-design', 'SKILL.md');
		const implementSkillPath = path.join(root, '.agents', 'skills', 'decision-aware-implement', 'SKILL.md');
		await fs.writeFile(designSkillPath, 'custom design skill\n', 'utf8');
		await fs.writeFile(implementSkillPath, 'custom implement skill\n', 'utf8');

		const result = await updateRuntimeAssets(root, { codex: true });
		const designSkillContents = await fs.readFile(designSkillPath, 'utf8');
		const implementSkillContents = await fs.readFile(implementSkillPath, 'utf8');
		const instructions = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');

		assert.ok(result.updated.includes('.agents/skills/decision-aware-design/SKILL.md'));
		assert.ok(result.updated.includes('.agents/skills/decision-aware-implement/SKILL.md'));
		assert.equal(result.updated.includes('.agents/agents/decision-aware-code-review.md'), false);
		assert.equal(designSkillContents, await readTemplate('skills/codex/decision-aware-design/SKILL.md'));
		assert.equal(implementSkillContents, await readTemplate('skills/codex/decision-aware-implement/SKILL.md'));
		assert.match(instructions, /sundial:agent-instructions/);
	});

	test('repairs legacy managed instruction blocks on update', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-update-instructions-'));
		await initStore(root, { codex: true });
		const instructionsPath = path.join(root, 'AGENTS.md');
		await fs.writeFile(instructionsPath, [
			'# Agent Instructions',
			'',
			'User-owned guidance.',
			'',
			'<!-- sundial:correction-feedback-loop -->',
			'old generated guidance',
			'<!-- /sundial:correction-feedback-loop -->',
			'',
		].join('\n'), 'utf8');

		const result = await updateRuntimeAssets(root, { codex: true });
		const instructions = await fs.readFile(instructionsPath, 'utf8');

		assert.ok(result.updated.includes('AGENTS.md'));
		assert.match(instructions, /User-owned guidance\./);
		assert.match(instructions, /sundial:agent-instructions/);
		assert.doesNotMatch(instructions, /sundial:correction-feedback-loop/);
		assert.doesNotMatch(instructions, /old generated guidance/);
	});

	test('handles Claude and Codex instruction files that share one symlink target', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-symlinked-instructions-'));
		await fs.mkdir(path.join(root, '.claude'), { recursive: true });
		await fs.writeFile(path.join(root, 'AGENTS.md'), '# Shared Instructions\n', 'utf8');
		await fs.symlink(path.join('..', 'AGENTS.md'), path.join(root, '.claude', 'CLAUDE.md'));

		const result = await initStore(root, { claude: true, codex: true });
		const sharedInstructions = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');

		assert.ok(result.updated.includes('.claude/CLAUDE.md') || result.updated.includes('AGENTS.md'));
		assert.equal((sharedInstructions.match(/<!-- sundial:agent-instructions -->/g) ?? []).length, 1);
		assert.match(sharedInstructions, /sundial candidate create/);
	});

	test('uses generic skill templates when Claude and Codex share skill files by symlink', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-symlinked-skills-'));
		await fs.mkdir(path.join(root, '.agents', 'skills'), { recursive: true });
		await fs.mkdir(path.join(root, '.claude'), { recursive: true });
		await fs.symlink(path.join('..', '.agents', 'skills'), path.join(root, '.claude', 'skills'));

		await initStore(root, { claude: true, codex: true });

		const sharedDesignSkill = await fs.readFile(path.join(root, '.agents', 'skills', 'decision-aware-design', 'SKILL.md'), 'utf8');
		const claudeDesignSkill = await fs.readFile(path.join(root, '.claude', 'skills', 'decision-aware-design', 'SKILL.md'), 'utf8');
		assert.equal(claudeDesignSkill, sharedDesignSkill);
		assert.equal(sharedDesignSkill, await readTemplate('skills/generic/decision-aware-design/SKILL.md'));
	});
});

async function readTemplate(relativePath: string): Promise<string> {
	return await fs.readFile(path.join(__dirname, '..', '..', 'src', 'core', 'templates', relativePath), 'utf8');
}
