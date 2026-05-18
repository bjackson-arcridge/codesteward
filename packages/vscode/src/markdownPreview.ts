interface FrontmatterEntry {
	readonly field: string;
	readonly values: readonly string[];
}

export function renderMarkdownPreviewSource(markdown: string): string {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown);
	if (match === null) {
		return markdown;
	}

	const [, frontmatter, body] = match;
	const entries = parseFrontmatterEntries(frontmatter);
	const remainingEntries = entries.filter(entry => !['title', 'domain'].includes(entry.field));
	const parts = [
		...renderFrontmatterSummary(entries),
		'',
		body.trimStart().trimEnd(),
	];

	if (remainingEntries.length > 0) {
		parts.push('', renderFrontmatterTable(remainingEntries));
	}

	return `${parts.join('\n')}\n`;
}

function renderFrontmatterSummary(entries: readonly FrontmatterEntry[]): readonly string[] {
	const title = firstEntryValue(entries, 'title') ?? 'Untitled';
	const domain = firstEntryValue(entries, 'domain') ?? 'all';
	return [
		`# ${escapeInlineMarkdown(title)}`,
		`**domain:** ${escapeInlineMarkdown(domain)}`,
	];
}

function renderFrontmatterTable(entries: readonly FrontmatterEntry[]): string {
	const rows = frontmatterRows(entries);
	return [
		'## Metadata',
		'',
		'<table style="border-collapse: collapse; border-spacing: 0;">',
		'<tbody>',
		...rows.map(row => [
			'<tr>',
			`<td align="right" style="border: none; padding-right: 0.75em; vertical-align: top;"><strong>${escapeHtml(row.field)}</strong></td>`,
			`<td align="left" style="border: none; border-left: 1px solid currentColor; padding-left: 0.75em; vertical-align: top;">${escapeHtml(row.value)}</td>`,
			'</tr>',
		].join('')),
		'</tbody>',
		'</table>',
	].join('\n');
}

function parseFrontmatterEntries(frontmatter: string): readonly FrontmatterEntry[] {
	const entries: FrontmatterEntry[] = [];
	let currentEntry: { field: string; values: string[] } | undefined;

	const closeCurrentField = (): void => {
		if (currentEntry !== undefined) {
			entries.push(currentEntry);
		}

		currentEntry = undefined;
	};

	const pushCurrentFieldValue = (value: string): void => {
		if (currentEntry === undefined) {
			entries.push({ field: '', values: [value] });
			return;
		}

		currentEntry.values.push(value);
	};

	for (const line of frontmatter.split(/\r?\n/)) {
		if (line.trim().length === 0) {
			continue;
		}

		const listItem = /^\s+-\s*(.*?)\s*$/.exec(line);
		if (listItem !== null && currentEntry !== undefined) {
			pushCurrentFieldValue(listItem[1]);
			continue;
		}

		const nestedValue = /^\s+([A-Za-z0-9_.-]+):\s*(.*?)\s*$/.exec(line);
		if (nestedValue !== null && currentEntry !== undefined) {
			const [, nestedField, value] = nestedValue;
			pushCurrentFieldValue(`${nestedField}: ${value}`);
			continue;
		}

		const fieldValue = /^([A-Za-z0-9_-]+):(?:\s*(.*?))?\s*$/.exec(line);
		if (fieldValue !== null) {
			closeCurrentField();
			const [, field, value = ''] = fieldValue;
			if (value.length === 0) {
				currentEntry = { field, values: [] };
			} else {
				entries.push({ field, values: [value] });
			}
			continue;
		}

		closeCurrentField();
		entries.push({ field: '', values: [line.trim()] });
	}

	closeCurrentField();
	return entries;
}

function frontmatterRows(entries: readonly FrontmatterEntry[]): readonly { readonly field: string; readonly value: string }[] {
	return entries.flatMap(entry => {
		if (entry.values.length === 0) {
			return [{ field: entry.field, value: '' }];
		}

		return entry.values.map((value, index) => ({
			field: index === 0 ? entry.field : '',
			value,
		}));
	});
}

function firstEntryValue(entries: readonly FrontmatterEntry[], field: string): string | undefined {
	return entryValues(entries, field)[0];
}

function entryValues(entries: readonly FrontmatterEntry[], field: string): readonly string[] {
	return entries.find(entry => entry.field === field)?.values ?? [];
}

function escapeInlineMarkdown(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.trim();
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replace(/\s+/g, ' ')
		.trim();
}
