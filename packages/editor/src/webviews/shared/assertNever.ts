export function assertNever(value: never): never {
	throw new Error(`Unexpected message: ${JSON.stringify(value)}`);
}
