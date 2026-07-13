const esbuild = require("esbuild");
const fs = require("fs/promises");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function copyTemplates() {
	const source = path.join('src', 'core', 'templates');
	const target = path.join('dist', 'templates');
	await fs.rm(target, { recursive: true, force: true });
	await fs.cp(source, target, { recursive: true });
}

async function makeEntrypointExecutable() {
	await fs.chmod(path.join('dist', 'main.js'), 0o755);
}

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/main.ts',
		],
		banner: {
			js: '#!/usr/bin/env node',
		},
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/main.js',
		logLevel: 'info',
	});

	await copyTemplates();

	if (watch) {
		await ctx.watch();
		return;
	}

	await ctx.rebuild();
	await makeEntrypointExecutable();
	await copyTemplates();
	await ctx.dispose();
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
