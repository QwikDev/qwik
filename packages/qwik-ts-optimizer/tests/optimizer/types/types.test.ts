/**
 * Type-level tests for optimizer API types.
 *
 * These tests verify that all API types are correctly defined and exported
 * with the expected fields and shapes.
 */
import { describe, it, expect } from 'vitest';
import type {
  TransformModulesOptions,
  TransformModuleInput,
  TransformOutput,
  TransformModule,
  SegmentAnalysis,
  EntryStrategy,
  MinifyMode,
  EmitMode,
  Diagnostic,
  DiagnosticHighlightFlat,
  SegmentMetadataInternal,
} from '../../../src/optimizer/types/types.js';
import {
  mkByteOffset,
  mkCanonicalFilename,
  mkColumnNumber,
  mkCtxName,
  mkDisplayName,
  mkFilePath,
  mkHash,
  mkLineNumber,
  mkOrigin,
  mkRelativePath,
  mkSourceText,
  mkSymbolName,
} from '../../../src/optimizer/types/brands.js';

describe('TransformModulesOptions', () => {
  it('accepts all expected fields', () => {
    const opts: TransformModulesOptions = {
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText('const x = 1;') }],
      srcDir: mkFilePath('/src'),
      rootDir: '/root',
      entryStrategy: { type: 'smart' },
      minify: 'none',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      preserveFilenames: false,
      explicitExtensions: false,
      mode: 'dev',
      scope: 'myapp',
      stripExports: ['serverFn'],
      regCtxName: ['component$'],
      stripCtxName: ['server$'],
      stripEventHandlers: false,
      isServer: true,
    };
    expect(opts.input).toHaveLength(1);
    expect(opts.srcDir).toBe('/src');
    expect(opts.isServer).toBe(true);
    expect(opts.stripExports).toEqual(['serverFn']);
    expect(opts.regCtxName).toEqual(['component$']);
    expect(opts.stripCtxName).toEqual(['server$']);
  });
});

describe('SegmentAnalysis', () => {
  it('has all required fields', () => {
    const seg: SegmentAnalysis = {
      origin: mkOrigin('test.tsx'),
      name: mkSymbolName('onClick_abc123'),
      entry: null,
      displayName: mkDisplayName('test_onClick'),
      hash: mkHash('abc123'),
      canonicalFilename: mkCanonicalFilename('test_onclick_abc123'),
      extension: 'tsx',
      parent: null,
      ctxKind: 'eventHandler',
      ctxName: mkCtxName('onClick$'),
      captures: true,
      loc: [mkByteOffset(10), mkByteOffset(50)],
    };
    expect(seg.origin).toBe('test.tsx');
    expect(seg.name).toBe('onClick_abc123');
    expect(seg.ctxKind).toBe('eventHandler');
    expect(seg.captures).toBe(true);
    expect(seg.loc).toEqual([10, 50]);
  });
});

describe('EntryStrategy', () => {
  it('covers all 7 variants', () => {
    const strategies: EntryStrategy[] = [
      { type: 'inline' },
      { type: 'hoist' },
      { type: 'hook' },
      { type: 'segment' },
      { type: 'single' },
      { type: 'component' },
      { type: 'smart' },
    ];
    expect(strategies).toHaveLength(7);

    // Variants with manual field
    const withManual: EntryStrategy = {
      type: 'smart',
      manual: { symbolA: 'bundleX' },
    };
    expect(withManual.type).toBe('smart');
  });
});

describe('TransformOutput', () => {
  it('has correct shape', () => {
    const output: TransformOutput = {
      modules: [],
      diagnostics: [],
      isTypeScript: true,
      isJsx: true,
    };
    expect(output.modules).toEqual([]);
    expect(output.isTypeScript).toBe(true);
  });
});

describe('TransformModule', () => {
  it('has correct shape', () => {
    const mod: TransformModule = {
      kind: 'parent',
      path: mkRelativePath('test.tsx'),
      isEntry: false,
      code: 'export const x = 1;',
      map: null,
      origPath: 'test.tsx',
    };
    expect(mod.path).toBe('test.tsx');
    expect(mod.kind).toBe('parent');
  });

  it('has correct shape for a parent variant', () => {
    // The parent variant no longer carries a `segment: null` field — the
    // discriminator `kind` gates variant-specific field access at
    // compile time.
    const mod: TransformModule = {
      kind: 'parent',
      path: mkRelativePath('test.tsx'),
      isEntry: false,
      code: 'export const x = 1;',
      map: null,
      origPath: 'test.tsx',
    };
    expect(mod.kind).toBe('parent');
    expect(mod.isEntry).toBe(false);
    expect(mod.origPath).toBe('test.tsx');
  });
});

describe('Diagnostic', () => {
  it('has correct shape with highlights (snapshot format)', () => {
    const diag: Diagnostic = {
      category: 'error',
      code: 'C02',
      file: 'test.tsx',
      message: 'Function reference error',
      highlights: [
        { lo: mkByteOffset(0), hi: mkByteOffset(10), startLine: mkLineNumber(1), startCol: mkColumnNumber(0), endLine: mkLineNumber(1), endCol: mkColumnNumber(10) },
      ],
      suggestions: null,
      scope: 'optimizer',
    };
    expect(diag.category).toBe('error');
    expect(diag.highlights).toHaveLength(1);
  });
});

describe('SegmentMetadataInternal', () => {
  it('extends SegmentAnalysis with optional paramNames and captureNames', () => {
    const meta: SegmentMetadataInternal = {
      origin: mkOrigin('test.tsx'),
      name: mkSymbolName('s_abc123'),
      entry: null,
      displayName: mkDisplayName('test_s'),
      hash: mkHash('abc123'),
      canonicalFilename: mkCanonicalFilename('test_s_abc123'),
      extension: 'tsx',
      parent: null,
      ctxKind: 'function',
      ctxName: mkCtxName('$'),
      captures: false,
      loc: [mkByteOffset(0), mkByteOffset(20)],
      paramNames: ['a', 'b'],
      captureNames: ['x', 'y'],
    };
    expect(meta.paramNames).toEqual(['a', 'b']);
    expect(meta.captureNames).toEqual(['x', 'y']);
  });
});
