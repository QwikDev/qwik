import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { transformModule } from '../../src/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'qwik-router-lib-snippet.mjs');

const BUNDLER_STRIP_CONFIG = {
	stripCtxName: ['route', 'zod$', 'validator$', 'globalAction$'],
	stripExports: [
		'onGet',
		'onPost',
		'onPut',
		'onRequest',
		'onDelete',
		'onHead',
		'onOptions',
		'onPatch',
		'onStaticGenerate',
	],
	stripEventHandlers: true,
} as const;

const SRC_DIR = '/workspace/fixtures/vite-qwik-router';
const INPUT_PATH = '/workspace/node_modules/@qwik.dev/router/lib/index.qwik.mjs';

function runTransform(source: string) {
	return transformModule({
		srcDir: mkFilePath(SRC_DIR),
		input: [
			{
				path: mkFilePath(INPUT_PATH),
				code: mkSourceText(source),
			},
		],
		transpileTs: true,
		transpileJsx: true,
		explicitExtensions: true,
		preserveFilenames: true,
		mode: 'prod',
		minify: 'simplify',
		...BUNDLER_STRIP_CONFIG,
	});
}

describe('chopped marker call mid-expression', () => {
	test('lib fixture emits no orphan `, X) => {` lines', () => {
		const source = readFileSync(FIXTURE_PATH, 'utf8');
		const result = runTransform(source);
		for (const mod of result.modules) {
			const lines = mod.code.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]!;
				expect(
					/^\s*,\s*\w+\)\s*=>/.test(line),
					`Orphan chopped-marker pattern at ${mod.kind} ${mod.path} L${i + 1}: ${JSON.stringify(line)}`,
				).toBe(false);
			}
		}
	});

	test('lib fixture emits zero diagnostics', () => {
		const source = readFileSync(FIXTURE_PATH, 'utf8');
		const result = runTransform(source);
		expect(result.diagnostics).toEqual([]);
	});
});

describe('segment origin + file extension resolve under bundler config', () => {
	test('every module origin is a well-formed relative path, not a slash-stripped absolute', () => {
		const source = readFileSync(FIXTURE_PATH, 'utf8');
		const result = runTransform(source);
		for (const mod of result.modules) {
			if (mod.kind !== 'segment') continue;
			const origin = mod.segment.origin;
			expect(
				origin.startsWith('/'),
				`origin is an unresolved absolute path: ${JSON.stringify(origin)}`,
			).toBe(false);
			expect(
				origin.startsWith('../../node_modules/@qwik.dev/router/lib/'),
				`origin is not the expected srcDir-relative path: ${JSON.stringify(origin)}`,
			).toBe(true);
		}
	});

	test('every sibling segment import resolves to an emitted segment file', () => {
		const source = readFileSync(FIXTURE_PATH, 'utf8');
		const result = runTransform(source);

		const segmentPaths = new Set<string>(
			result.modules.filter((m) => m.kind === 'segment').map((m) => m.path),
		);
		expect(segmentPaths.size, 'fixture should emit segments').toBeGreaterThan(0);

		const importRe = /(?:import\(\s*|from\s*)["'](\.[^"']+)["']/g;
		let checked = 0;
		for (const mod of result.modules) {
			const baseDir = mod.kind === 'segment' ? dirname(mod.path) : dirname(INPUT_PATH);
			for (const match of mod.code.matchAll(importRe)) {
				const spec = match[1]!;
				if (!spec.includes('index.qwik.mjs_')) continue;
				checked++;
				const resolved = join(baseDir, spec);
				expect(
					segmentPaths.has(resolved),
					`Sibling segment import ${JSON.stringify(spec)} in ${mod.kind} ${mod.path} resolves to ${resolved}, which is not an emitted segment (file-extension mismatch?)`,
				).toBe(true);
			}
		}
		expect(checked, 'fixture should exercise sibling segment imports').toBeGreaterThan(0);
	});
});

describe('segment body cut off mid-expression', () => {
	test('every emitted module parses cleanly', () => {
		const source = readFileSync(FIXTURE_PATH, 'utf8');
		const result = runTransform(source);

		for (const mod of result.modules) {
			const parsed = parseSync(mod.path, mod.code);
			expect(
				parsed.errors,
				`Parse errors in ${mod.kind} ${mod.path}: ${JSON.stringify(parsed.errors)}`,
			).toEqual([]);
		}
	});
});

describe('no duplicate @qwik.dev/core import when a replaced const shares an import', () => {
	const SOURCE = `import { createAsyncQrl, inlinedQrl, _captures, isBrowser, withLocale } from '@qwik.dev/core';
const f = () => isBrowser ? 1 : 2;
const g = (locale) => withLocale(locale, () => 42);
const h = (a, b, c) => createAsyncQrl(/* @__PURE__ */ inlinedQrl(async () => {
	const x = _captures[0];
	return x;
}, "h_createAsync_CFLMoh8rnzw", [a, b, c]));
export { f, g, h };
`;

	function transformChunk() {
		return transformModule({
			srcDir: mkFilePath(SRC_DIR),
			input: [
				{
					path: mkFilePath('/workspace/node_modules/@qwik.dev/router/lib/chunks/routing.qwik.mjs'),
					code: mkSourceText(SOURCE),
				},
			],
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			mode: 'prod',
			minify: 'simplify',
			stripCtxName: ['useServer', 'server', 'route', 'zod$', 'validator$', 'globalAction$'],
			stripExports: [
				'onGet',
				'onPost',
				'onPut',
				'onRequest',
				'onDelete',
				'onHead',
				'onOptions',
				'onPatch',
				'onStaticGenerate',
			],
			isServer: false,
		});
	}

	test('no @qwik.dev/core specifier is imported more than once per module', () => {
		const result = transformChunk();
		const importRe = /import\s*\{([^}]*)\}\s*from\s*["']@qwik\.dev\/core["']/g;
		for (const mod of result.modules) {
			const names: string[] = [];
			for (const m of mod.code.matchAll(importRe)) {
				for (const part of m[1]!.split(',')) {
					const name = part.trim().split(/\s+as\s+/).pop()?.trim();
					if (name) names.push(name);
				}
			}
			const dups = names.filter((n, i) => names.indexOf(n) !== i);
			expect(
				dups,
				`Duplicate @qwik.dev/core import(s) in ${mod.kind} ${mod.path}: ${dups.join(', ')}`,
			).toEqual([]);
		}
	});
});

describe('client strip config (stripEventHandlers unset) — full lib', () => {
	const CLIENT_STRIP_CONFIG = {
		stripCtxName: ['useServer', 'server', 'route', 'zod$', 'validator$', 'globalAction$'],
		stripExports: BUNDLER_STRIP_CONFIG.stripExports,
	} as const;

	function runClient(source: string) {
		return transformModule({
			srcDir: mkFilePath(SRC_DIR),
			input: [{ path: mkFilePath(INPUT_PATH), code: mkSourceText(source) }],
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			mode: 'prod',
			minify: 'simplify',
			isServer: false,
			...CLIENT_STRIP_CONFIG,
		});
	}

	test('every emitted module parses cleanly', () => {
		const result = runClient(readFileSync(FIXTURE_PATH, 'utf8'));
		for (const mod of result.modules) {
			const parsed = parseSync(mod.path, mod.code);
			expect(
				parsed.errors,
				`Parse errors in ${mod.kind} ${mod.path}: ${JSON.stringify(parsed.errors)}`,
			).toEqual([]);
		}
	});

	test('inlinedQrl task body keeps its destructured context param (not _rawProps)', () => {
		const result = runClient(readFileSync(FIXTURE_PATH, 'utf8'));
		const taskSeg = result.modules.find(
			(m) => m.kind === 'segment' && m.path.includes('useQwikRouter_useTask'),
		);
		expect(taskSeg, 'useQwikRouter useTask segment should be emitted').toBeDefined();
		expect(taskSeg!.code).toContain('({ track })');
		expect(taskSeg!.code).not.toContain('_rawProps');
	});

	test('no PURE annotation is stranded before a bare q_<symbol> reference', () => {
		const result = runClient(readFileSync(FIXTURE_PATH, 'utf8'));
		const strandedPure = /\/\*\s*[#@]__PURE__\s*\*\/\s*q_/;
		for (const mod of result.modules) {
			expect(
				strandedPure.test(mod.code),
				`Stranded PURE annotation before a q_ reference in ${mod.kind} ${mod.path}`,
			).toBe(false);
		}
	});

	test('inlinedQrl `serverQrl` dispatcher is not stripped under stripCtxName: [server]', () => {
		const result = runClient(readFileSync(FIXTURE_PATH, 'utf8'));

		const serverQrlSeg = result.modules.find(
			(m) => m.kind === 'segment' && m.path.includes('serverQrl'),
		);
		expect(serverQrlSeg, 'serverQrl dispatcher segment should be emitted').toBeDefined();
		expect(serverQrlSeg!.code).not.toMatch(/=\s*null\s*;\s*$/m);
		expect(serverQrlSeg!.code.length).toBeGreaterThan(200);

		const parent = result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!;
		expect(parent.code).toMatch(/qrl\(\(\)\s*=>\s*import\([^)]*serverQrl/);
		expect(parent.code).not.toMatch(/_noopQrl\("[^"]*serverQrl/);
	});
});

describe('inline/hoist strategy keeps the `_captures` import used by inlined bodies', () => {
	const code = `import { useTaskQrl, inlinedQrl, _captures, useSignal } from '@qwik.dev/core';

export const useThing = () => {
	const dep = useSignal(0);
	useTaskQrl(/* @__PURE__ */ inlinedQrl(({ track }) => {
		const dep2 = _captures[0];
		track(dep2);
	}, "useThing_useTask_XpalYii770E", [dep]));
};
`;

	function runServerHoist() {
		return transformModule({
			srcDir: mkFilePath(SRC_DIR),
			input: [{ path: mkFilePath(INPUT_PATH), code: mkSourceText(code) }],
			entryStrategy: { type: 'hoist' },
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			mode: 'hmr',
			minify: 'simplify',
			isServer: true,
			stripEventHandlers: true,
			regCtxName: ['server'],
			stripCtxName: ['useClient', 'useBrowser', 'useVisibleTask', 'client', 'browser'],
		});
	}

	test('parent module that inlines a `_captures`-using body still imports `_captures`', () => {
		const result = runServerHoist();
		const parent = result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!;

		expect(parent.code).toMatch(/\b_captures\s*\[/);
		expect(parent.code).toMatch(/import\s*\{[^}]*\b_captures\b[^}]*\}\s*from\s*["']@qwik\.dev\/core["']/);

		for (const m of result.modules) {
			const ext = m.path.endsWith('.tsx') || m.path.endsWith('.jsx') ? 'tsx' : 'mjs';
			const parsed = parseSync(`mod.${ext}`, m.code);
			expect(parsed.errors, `module ${m.path} should parse`).toHaveLength(0);
		}
	});
});
