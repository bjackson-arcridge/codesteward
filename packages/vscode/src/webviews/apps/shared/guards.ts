export function assertNever(value: never): never {
	throw new Error(`unhandled discriminant: ${JSON.stringify(value)}`);
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

export function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(isString);
}
