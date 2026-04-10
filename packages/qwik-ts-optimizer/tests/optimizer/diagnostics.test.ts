/**
 * Tests for the diagnostics module.
 *
 * Covers: C02 (FunctionReference), C03 (CanNotCapture),
 * parseDisableDirectives, filterSuppressedDiagnostics.
 */

import { describe, it, expect } from 'vitest';
import {
  emitC02,
  emitC03,
  parseDisableDirectives,
  filterSuppressedDiagnostics,
} from '../../src/optimizer/diagnostics.js';
import type { Diagnostic } from '../../src/optimizer/types.js';

describe('emitC02', () => {
  it('produces error with code C02 for a function reference', () => {
    const diag = emitC02('hola', 'test.tsx', false);
    expect(diag.category).toBe('error');
    expect(diag.code).toBe('C02');
    expect(diag.file).toBe('test.tsx');
    expect(diag.message).toBe(
      "Reference to identifier 'hola' can not be used inside a Qrl($) scope because it's a function"
    );
    expect(diag.highlights).toBeNull();
    expect(diag.suggestions).toBeNull();
    expect(diag.scope).toBe('optimizer');
  });

  it('produces error with code C02 for a class reference', () => {
    const diag = emitC02('Thing', 'test.tsx', true);
    expect(diag.category).toBe('error');
    expect(diag.code).toBe('C02');
    expect(diag.message).toBe(
      "Reference to identifier 'Thing' can not be used inside a Qrl($) scope because it's a function"
    );
    expect(diag.highlights).toBeNull();
    expect(diag.scope).toBe('optimizer');
  });

  it('does not emit for uncaptured identifiers (caller responsibility)', () => {
    // This is a caller-level concern -- emitC02 always emits. Tested here for API shape only.
    const diag = emitC02('Other', 'test.tsx', true);
    expect(diag.code).toBe('C02');
  });
});

describe('emitC03', () => {
  it('produces error with code C03 listing captured identifiers', () => {
    const diag = emitC03(['qrl'], 'test.tsx', {
      lo: 109,
      hi: 112,
      startLine: 5,
      startCol: 22,
      endLine: 5,
      endCol: 24,
    });
    expect(diag.category).toBe('error');
    expect(diag.code).toBe('C03');
    expect(diag.message).toBe(
      "Qrl($) scope is not a function, but it's capturing local identifiers: qrl"
    );
    expect(diag.highlights).toEqual([
      { lo: 109, hi: 112, startLine: 5, startCol: 22, endLine: 5, endCol: 24 },
    ]);
    expect(diag.suggestions).toBeNull();
    expect(diag.scope).toBe('optimizer');
  });

  it('comma-separates multiple captured identifiers', () => {
    const diag = emitC03(['a', 'b', 'c'], 'test.tsx');
    expect(diag.message).toBe(
      "Qrl($) scope is not a function, but it's capturing local identifiers: a, b, c"
    );
  });

  it('has null highlights when no span provided', () => {
    const diag = emitC03(['x'], 'test.tsx');
    expect(diag.highlights).toBeNull();
  });
});

describe('parseDisableDirectives', () => {
  it('parses single code directive', () => {
    const source = `// line 1
/* @qwik-disable-next-line C05 */
useMemo$(() => {});`;
    const directives = parseDisableDirectives(source);
    // Directive on line 2 suppresses line 3
    expect(directives.get(3)?.has('C05')).toBe(true);
  });

  it('parses multiple comma-separated codes', () => {
    const source = `// line 1
/* @qwik-disable-next-line C05, preventdefault-passive-check */
someLine();`;
    const directives = parseDisableDirectives(source);
    expect(directives.get(3)?.has('C05')).toBe(true);
    expect(directives.get(3)?.has('preventdefault-passive-check')).toBe(true);
  });

  it('parses JSX comment form', () => {
    const source = `<div>
{/* @qwik-disable-next-line preventdefault-passive-check */}
<button passive:click preventdefault:click />
</div>`;
    const directives = parseDisableDirectives(source);
    expect(directives.get(3)?.has('preventdefault-passive-check')).toBe(true);
  });

  it('returns empty map for source without directives', () => {
    const directives = parseDisableDirectives('const x = 1;\nconst y = 2;');
    expect(directives.size).toBe(0);
  });
});

describe('filterSuppressedDiagnostics', () => {
  it('removes diagnostics matching directive codes', () => {
    const diags: Diagnostic[] = [
      emitC03(['qrl'], 'test.tsx', { lo: 0, hi: 10, startLine: 3, startCol: 1, endLine: 3, endCol: 10 }),
    ];
    const directives = new Map<number, Set<string>>();
    directives.set(3, new Set(['C03']));
    const result = filterSuppressedDiagnostics(diags, directives);
    expect(result).toHaveLength(0);
  });

  it('keeps diagnostics not matching directive codes', () => {
    const diags: Diagnostic[] = [
      emitC02('hola', 'test.tsx', false),
    ];
    const directives = new Map<number, Set<string>>();
    directives.set(5, new Set(['C05']));
    const result = filterSuppressedDiagnostics(diags, directives);
    expect(result).toHaveLength(1);
  });

  it('suppresses only the NEXT line, not subsequent lines', () => {
    // Directive on line 2 suppresses line 3 only
    const diags: Diagnostic[] = [
      // Diagnostic on line 3 -- should be suppressed
      emitC03(['a'], 'test.tsx', { lo: 20, hi: 30, startLine: 3, startCol: 1, endLine: 3, endCol: 10 }),
      // Diagnostic on line 4 -- should NOT be suppressed
      emitC03(['b'], 'test.tsx', { lo: 40, hi: 50, startLine: 4, startCol: 1, endLine: 4, endCol: 10 }),
    ];
    const directives = new Map<number, Set<string>>();
    directives.set(3, new Set(['C03'])); // Only line 3 is suppressed
    const result = filterSuppressedDiagnostics(diags, directives);
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('b');
  });

  it('handles diagnostics with null highlights (uses no line matching)', () => {
    // C02 has null highlights -- no line info available, so cannot be suppressed by line
    // Unless we add line tracking to C02 later
    const diags: Diagnostic[] = [emitC02('hola', 'test.tsx', false)];
    const directives = new Map<number, Set<string>>();
    directives.set(5, new Set(['C02']));
    const result = filterSuppressedDiagnostics(diags, directives);
    // C02 has null highlights, no startLine -- cannot match line-based suppression
    expect(result).toHaveLength(1);
  });
});
