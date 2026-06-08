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
import { join } from 'node:path';

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

function runTransform(source: string) {
	return transformModule({
		srcDir: mkFilePath('/workspace/fixtures/vite-qwik-router'),
		input: [
			{
				path: mkFilePath('/workspace/node_modules/@qwik.dev/router/lib/index.qwik.mjs'),
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

describe('OSS-458 — unresolved `./chunks/*.qwik.mjs` imports in segments (OPEN)', () => {
	// The bug: when extracting segments from a lib like @qwik.dev/router, the
	// lib's pre-bundled segment files carry relative imports against the lib's
	// internal `chunks/` directory (`./chunks/routing.qwik.mjs`). The TS
	// optimizer preserves these imports in the extracted segment as-is, but
	// the segment now lives at a `\0qwik:segment:client:...` virtual location
	// where the relative path doesn't resolve, producing 30+ UNRESOLVED_IMPORT
	// errors in the bundler's Rolldown pass.
	//
	// This test is currently FAILING (marked with `.fails`) — Sub-B (OSS-458)
	// is open work. Flip back to a regular `test` once the fix lands.
	test.fails(
		'segment-emitted code from lib does not retain `./chunks/X.qwik.mjs` imports',
		() => {
			const source = readFileSync(FIXTURE_PATH, 'utf8');
			const result = runTransform(source);
			for (const mod of result.modules) {
				if (mod.kind !== 'segment') continue;
				expect(
					mod.code.includes('./chunks/'),
					`Segment ${mod.path} retains a relative ./chunks/ import that won't resolve from its virtual location`,
				).toBe(false);
			}
		},
	);
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
