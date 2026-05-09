export interface HarnessSelection {
	readonly claude?: boolean;
	readonly codex?: boolean;
}

export type HarnessRoot = '.claude' | '.agents';
export type SkillTemplateSet = 'generic' | 'claude' | 'codex';

export interface ManagedInstructionTarget {
	readonly relativePath: string;
	readonly title: string;
}

export interface HarnessInstallContext {
	ensureManagedInstructions(target: ManagedInstructionTarget): Promise<void>;
	ensureSkillTemplates(input: SkillTemplateInstall): Promise<void>;
	updateSkillTemplates(input: SkillTemplateInstall): Promise<void>;
}

export interface SkillTemplateInstall {
	readonly root: HarnessRoot;
	readonly preferredTemplateSet: SkillTemplateSet;
}

export interface AgentHarnessInstaller {
	readonly name: 'claude' | 'codex';
	readonly root: HarnessRoot;
	install(context: HarnessInstallContext): Promise<void>;
	update(context: HarnessInstallContext): Promise<void>;
}

export function selectedHarnessInstallers(options: HarnessSelection): readonly AgentHarnessInstaller[] {
	const installers: AgentHarnessInstaller[] = [];
	if (options.claude === true) {
		installers.push(claudeInstaller);
	}

	if (options.codex === true) {
		installers.push(codexInstaller);
	}

	return installers;
}

const claudeInstaller: AgentHarnessInstaller = {
	name: 'claude',
	root: '.claude',
	async install(context) {
		await context.ensureManagedInstructions({
			relativePath: '.claude/CLAUDE.md',
			title: 'Claude Code Instructions',
		});
		await context.ensureSkillTemplates({
			root: '.claude',
			preferredTemplateSet: 'claude',
		});
	},
	async update(context) {
		await context.ensureManagedInstructions({
			relativePath: '.claude/CLAUDE.md',
			title: 'Claude Code Instructions',
		});
		await context.updateSkillTemplates({
			root: '.claude',
			preferredTemplateSet: 'claude',
		});
	},
};

const codexInstaller: AgentHarnessInstaller = {
	name: 'codex',
	root: '.agents',
	async install(context) {
		await context.ensureManagedInstructions({
			relativePath: 'AGENTS.md',
			title: 'Agent Instructions',
		});
		await context.ensureSkillTemplates({
			root: '.agents',
			preferredTemplateSet: 'codex',
		});
	},
	async update(context) {
		await context.ensureManagedInstructions({
			relativePath: 'AGENTS.md',
			title: 'Agent Instructions',
		});
		await context.updateSkillTemplates({
			root: '.agents',
			preferredTemplateSet: 'codex',
		});
	},
};
