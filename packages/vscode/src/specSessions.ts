export const specSessionPhases = ['planning', 'implementation', 'review'] as const;
export type SpecSessionPhase = typeof specSessionPhases[number];

export const specSessionProviders = ['claude', 'codex'] as const;
export type SpecSessionProvider = typeof specSessionProviders[number];

export interface SpecSessionSpec {
	readonly id: string;
	readonly title: string;
	readonly filePath: string;
}

export interface CodexSpecSessionArguments {
	readonly fileName: string;
	readonly line: number;
	readonly comment: string;
}

export type SpecSessionLaunchResult =
	| { readonly kind: 'prefilled'; readonly provider: 'claude'; readonly uri: string; readonly prompt: string }
	| { readonly kind: 'codex-todo-handoff'; readonly provider: 'codex'; readonly args: CodexSpecSessionArguments }
	| { readonly kind: 'codex-clipboard-handoff'; readonly provider: 'codex'; readonly prompt: string }
	| { readonly kind: 'unavailable'; readonly provider?: SpecSessionProvider; readonly reason: 'missing-extension' | 'launch-failed' };

interface SpecSessionPhaseDetails {
	readonly skillName: string;
	readonly verb: string;
	readonly sectionHeading: string;
	readonly codexSlashCommand?: '/plan' | '/review';
}

const phaseDetails: Record<SpecSessionPhase, SpecSessionPhaseDetails> = {
	planning: {
		skillName: 'decision-aware-design',
		verb: 'plan',
		sectionHeading: 'Planned Approach',
		codexSlashCommand: '/plan',
	},
	implementation: {
		skillName: 'decision-aware-implement',
		verb: 'implement',
		sectionHeading: 'Implementation Log',
	},
	review: {
		skillName: 'decision-aware-review',
		verb: 'review',
		sectionHeading: 'Test Log',
		codexSlashCommand: '/review',
	},
};

export function isSpecSessionPhase(value: unknown): value is SpecSessionPhase {
	return typeof value === 'string' && (specSessionPhases as readonly string[]).includes(value);
}

export function isSpecSessionProvider(value: unknown): value is SpecSessionProvider {
	return typeof value === 'string' && (specSessionProviders as readonly string[]).includes(value);
}

export function buildSpecSessionPrompt(phase: SpecSessionPhase, spec: SpecSessionSpec): string {
	const details = phaseDetails[phase];
	const id = normalizePromptPart(spec.id);
	const title = normalizePromptPart(spec.title).replaceAll('"', "'");
	const filePath = normalizePromptPart(spec.filePath);
	return `Use the Sundial ${details.skillName} skill/instructions to ${details.verb} ${id} "${title}" at ${filePath}.`;
}

export function buildProviderSpecSessionPrompt(
	provider: SpecSessionProvider,
	phase: SpecSessionPhase,
	spec: SpecSessionSpec,
): string {
	const prompt = buildSpecSessionPrompt(phase, spec);
	const slashCommand = provider === 'codex' ? phaseDetails[phase].codexSlashCommand : undefined;
	let codexPhaseGuard = '';
	if (provider === 'codex' && phase === 'planning') {
		codexPhaseGuard = 'Planning only. ';
	} else if (provider === 'codex' && phase === 'review') {
		codexPhaseGuard = 'Review only. ';
	}

	return slashCommand === undefined ? prompt : `${slashCommand} ${codexPhaseGuard}${prompt}`;
}

export function buildClaudeSpecSessionUri(phase: SpecSessionPhase, spec: SpecSessionSpec): string {
	return `vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(buildProviderSpecSessionPrompt('claude', phase, spec))}`;
}

export function buildCodexSpecSessionArguments(
	phase: SpecSessionPhase,
	spec: SpecSessionSpec,
	markdown: string,
): CodexSpecSessionArguments {
	return {
		fileName: encodeURIComponent(spec.filePath),
		line: findSpecSectionLine(markdown, phase),
		comment: buildProviderSpecSessionPrompt('codex', phase, spec),
	};
}

export function findSpecSectionLine(markdown: string, phase: SpecSessionPhase): number {
	const heading = phaseDetails[phase].sectionHeading;
	const headingPattern = new RegExp(`^\\s*#{2,6}\\s+${escapeRegExp(heading)}\\s*$`, 'i');
	const lines = markdown.split(/\r\n|\r|\n/);
	const index = lines.findIndex(line => headingPattern.test(line));
	return index === -1 ? 1 : index + 1;
}

function normalizePromptPart(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
