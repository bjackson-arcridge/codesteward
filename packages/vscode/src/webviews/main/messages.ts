import {
	type HostToWebview as CandidateHostToWebview,
	type WebviewToHost as CandidateWebviewToHost,
	isHostToWebview as isCandidateHostToWebview,
	isWebviewToHost as isCandidateWebviewToHost,
} from '../candidates/messages';
import {
	type HostToWebview as RecordHostToWebview,
	type WebviewToHost as RecordWebviewToHost,
	isHostToWebview as isRecordHostToWebview,
	isWebviewToHost as isRecordWebviewToHost,
} from '../records/messages';

export const sidebarSections = ['records', 'research', 'specs', 'candidates', 'rejected', 'retired'] as const;
export type SidebarSection = typeof sidebarSections[number];
export type SectionHostToWebview = RecordHostToWebview | CandidateHostToWebview;
export type SectionWebviewToHost = RecordWebviewToHost | CandidateWebviewToHost;

export type HostToWebview =
	| { kind: 'state'; activeSection: SidebarSection; visibleSections: readonly SidebarSection[]; sectionState: SectionHostToWebview }
	| { kind: 'sectionMessage'; section: SidebarSection; message: SectionHostToWebview };

export type WebviewToHost =
	| { kind: 'selectSection'; section: SidebarSection }
	| { kind: 'setSectionVisibility'; section: SidebarSection; visible: boolean }
	| { kind: 'sectionMessage'; section: SidebarSection; message: SectionWebviewToHost };

export function isHostToWebview(value: unknown): value is HostToWebview {
	if (!isRecord(value)) {
		return false;
	}

	if (value.kind === 'state') {
		return isSidebarSection(value.activeSection)
			&& isVisibleSections(value.visibleSections)
			&& value.visibleSections.includes(value.activeSection)
			&& isSectionHostMessage(value.activeSection, value.sectionState);
	}

	return value.kind === 'sectionMessage'
		&& isSidebarSection(value.section)
		&& isSectionHostMessage(value.section, value.message);
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
	if (!isRecord(value)) {
		return false;
	}

	if (value.kind === 'selectSection') {
		return isSidebarSection(value.section);
	}
	if (value.kind === 'setSectionVisibility') {
		return isSidebarSection(value.section) && typeof value.visible === 'boolean';
	}

	return value.kind === 'sectionMessage'
		&& isSidebarSection(value.section)
		&& isSectionWebviewMessage(value.section, value.message);
}

export function isSidebarSection(value: unknown): value is SidebarSection {
	return typeof value === 'string' && sidebarSections.includes(value as SidebarSection);
}

function isVisibleSections(value: unknown): value is readonly SidebarSection[] {
	return Array.isArray(value)
		&& value.length > 0
		&& value.every(isSidebarSection)
		&& new Set(value).size === value.length;
}

function isSectionHostMessage(section: SidebarSection, value: unknown): value is SectionHostToWebview {
	return section === 'candidates' ? isCandidateHostToWebview(value) : isRecordHostToWebview(value);
}

function isSectionWebviewMessage(section: SidebarSection, value: unknown): value is SectionWebviewToHost {
	return section === 'candidates' ? isCandidateWebviewToHost(value) : isRecordWebviewToHost(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
