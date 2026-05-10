export const sundialCliCommand = 'sundial';
export const sundialCliNpmPackage = '@arcridge/sundial';

export function sundialCliInstallArgs(): readonly string[] {
	return ['install', '-g', sundialCliNpmPackage];
}
