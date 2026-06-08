// Regression tests for the OSS-456 qwik-router lib processing parity umbrella.
//
// These exercise processing of `@qwik.dev/router/lib/*.qwik.mjs` pre-bundled
// library code, which is the territory where the bundler-integration smoke
// surfaced multiple parse errors and unresolved-import failures in TS mode
// (SWC mode handles all of these cleanly).
//
// All tests use a fixture extracted from the real qwik-router lib output.
// The fixture lives at `tests/fixtures/qwik-router-lib-snippet.mjs` and is a
// 300-line excerpt covering the marker constructs that surfaced bugs: zod$,
// validator$, globalAction$ via implicit$FirstArg(XQrl) patterns, plus the
// surrounding helper functions whose declaration boundaries got chopped.

import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { transformModule } from '../../src/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'qwik-router-lib-snippet.mjs');

// Bundler-equivalent strip config — what qwik-bundler passes through to the
// optimizer for a client build with router strip names registered.
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

// The lib lives in `node_modules` two levels above srcDir and is handed to the
// optimizer as an absolute path — the shape the Rolldown adapter passes.
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

describe('OSS-457 — chopped marker call mid-expression', () => {
	// The bug: with strip config active (zod$/validator$/globalAction$ in
	// stripCtxName + stripEventHandlers: true), the optimizer was producing
	// orphan `, qrl) => {` lines mid-output. The corresponding source had a
	// complete `const getValidators = (rest, qrl) => {` declaration that
	// got chopped to just the trailing `, qrl) => {` and merged with the
	// previous (now-broken) const declaration.
	//
	// Fixed inadvertently by PR #211 (router-integration bugs).
	// This test pins the fix.
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
	// The original framing of this gap — "segments retain `./chunks/*.qwik.mjs`
	// imports, so strip them" — was wrong: SWC emits those exact `./chunks/`
	// imports too (the lib's pre-bundled chunks are real sibling files). The
	// real bundler-integration blockers were two metadata-shape bugs that only
	// surface when the optimizer is handed an absolute input path for a lib
	// living in `node_modules` outside srcDir — exactly what the Rolldown
	// adapter passes:
	//
	//   1. ORIGIN SHAPE. `origin` must be a well-formed relative path
	//      (`../../node_modules/…`), not a leading-slash-stripped absolute
	//      (`workspace/node_modules/…`). The bundler anchors each segment's own
	//      relative imports (`./chunks/routing.qwik.mjs`) by resolving them
	//      against `origin`; a slash-stripped absolute resolves to garbage and
	//      Rolldown reports UNRESOLVED_IMPORT.
	//
	//   2. FILE EXTENSION. A segment's emitted-file extension (`module.path`)
	//      must equal the extension used by sibling QRL `import("./…")`
	//      specifiers. Under transpileTs the imports use `.js`; if the segment
	//      registered at `.mjs` the bundler's segment-registry exact-match
	//      missed and Rolldown reported UNRESOLVED_IMPORT. SWC keeps both `.js`.

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
			// srcDir is `/workspace/fixtures/vite-qwik-router`; the lib lives at
			// `/workspace/node_modules/@qwik.dev/router/lib/…`, two levels up, so
			// the correct srcDir-relative origin is `../../node_modules/…`.
			expect(
				origin.startsWith('../../node_modules/@qwik.dev/router/lib/'),
				`origin is not the expected srcDir-relative path: ${JSON.stringify(origin)}`,
			).toBe(true);
		}
	});

	test('every sibling segment import resolves to an emitted segment file', () => {
		const source = readFileSync(FIXTURE_PATH, 'utf8');
		const result = runTransform(source);

		// Mirror the bundler's segment registry: the set of paths each emitted
		// segment is registered under (`segmentId(env, module.path)`).
		const segmentPaths = new Set<string>(
			result.modules.filter((m) => m.kind === 'segment').map((m) => m.path),
		);
		expect(segmentPaths.size, 'fixture should emit segments').toBeGreaterThan(0);

		// Specifiers the optimizer itself emits for sibling segment files carry
		// the source basename (`index.qwik.mjs_<symbol>`); lib-internal
		// `./chunks/…` imports are deliberately excluded — those resolve against
		// `origin` on disk, not against the segment registry.
		const importRe = /(?:import\(\s*|from\s*)["'](\.[^"']+)["']/g;
		let checked = 0;
		for (const mod of result.modules) {
			// Mirror the bundler's resolveId: a segment importer resolves its
			// relative imports against its own registered `module.path`; a
			// non-segment importer (the parent) resolves against its real module
			// id — i.e. the absolute input path. (The parent's `module.path` is
			// in the srcDir-relative namespace, distinct from the segment paths,
			// so resolving against it would be wrong here.)
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

describe('OSS-459 — segment body cut off mid-expression', () => {
	// The bug: a useTask$ segment body was missing its closing brace, producing
	// "Expected `}` but found `EOF`" parse errors. Likely the same root cause
	// as OSS-457 (mid-expression extraction boundary).
	//
	// Fixed inadvertently by PR #211. This test pins the fix — every emitted
	// module's code must parse cleanly.
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
	// A lib chunk that imports a const-replacement target (isBrowser/isServer/
	// isDev) ALONGSIDE surviving specifiers, under prod + the client strip
	// config, used to emit TWO `@qwik.dev/core` imports: one usage-filtered copy
	// in the preamble, and a stale copy re-introduced at body start. The cause:
	// `processImports` removes every original import and rebuilds survivors, then
	// const-replacement's removal pass overwrote the already-removed original
	// import range — re-materialising it. The duplicate `createAsyncQrl`
	// declaration broke Rolldown with "identifier already declared".
	//
	// Trigger requires the const target to be actually USED (so replacement
	// fires) and the original import to carry other surviving specifiers. Source
	// mirrors the shape of `@qwik.dev/router/lib/chunks/routing.qwik.mjs`.
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
			// Real bundler CLIENT strip config — note `stripEventHandlers` is unset
			// on the client path (distinct from BUNDLER_STRIP_CONFIG above), which
			// is what exercises the const-replacement interaction.
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
