/**
 * Tests for the diagnostics module.
 *
 * Covers: C02 (FunctionReference), C03 (CanNotCapture), C05 (MissingQrlImplementation),
 * preventdefault-passive-check, parseDisableDirectives, filterSuppressedDiagnostics,
 * and integration with the transform pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  emitC02,
  emitC03,
  emitC05,
  emitPreventdefaultPassiveCheck,
  parseDisableDirectives,
  filterSuppressedDiagnostics,
} from '../../src/optimizer/diagnostics.js';
import { transformModule } from '../../src/optimizer/transform.js';
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

// ---------------------------------------------------------------------------
// C05 and preventdefault-passive-check unit tests
// ---------------------------------------------------------------------------

describe('emitC05', () => {
  it('produces error with code C05 for missing Qrl export', () => {
    const diag = emitC05('useMemo$', 'useMemoQrl', 'test.tsx', {
      lo: 241,
      hi: 249,
      startLine: 11,
      startCol: 5,
      endLine: 11,
      endCol: 12,
    });
    expect(diag.category).toBe('error');
    expect(diag.code).toBe('C05');
    expect(diag.message).toBe(
      "Found 'useMemo$' but did not find the corresponding 'useMemoQrl' exported in the same file. Please check that it is exported and spelled correctly"
    );
    expect(diag.highlights).toEqual([
      { lo: 241, hi: 249, startLine: 11, startCol: 5, endLine: 11, endCol: 12 },
    ]);
    expect(diag.scope).toBe('optimizer');
  });
});

describe('emitPreventdefaultPassiveCheck', () => {
  it('produces warning for passive + preventdefault conflict', () => {
    const diag = emitPreventdefaultPassiveCheck('click', 'test.tsx');
    expect(diag.category).toBe('warning');
    expect(diag.code).toBe('preventdefault-passive-check');
    expect(diag.message).toBe(
      'preventdefault:click has no effect when passive:click is also set; passive event listeners cannot call preventDefault()'
    );
    expect(diag.scope).toBe('optimizer');
  });
});

// ---------------------------------------------------------------------------
// Integration tests -- diagnostics through transform pipeline
// ---------------------------------------------------------------------------

describe('transform pipeline diagnostics', () => {
  it('emits C02 for function/class captures in example_capturing_fn_class', () => {
    const input = `
import { $, component$ } from '@qwik.dev/core';

export const App = component$(() => {
\tfunction hola() {
\t\tconsole.log('hola');
\t}
\tclass Thing {}
\tclass Other {}

\treturn $(() => {
\t\thola();
\t\tnew Thing();
\t\treturn (
\t\t\t<div></div>
\t\t)
\t});
})
`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    // Should still produce code output (diagnostics are non-blocking)
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.modules[0].code).toBeTruthy();

    // Should emit C02 diagnostics for hola and Thing (not Other -- not captured)
    const c02Diags = result.diagnostics.filter((d) => d.code === 'C02');
    expect(c02Diags.length).toBe(2);

    const messages = c02Diags.map((d) => d.message);
    expect(messages).toContainEqual(
      "Reference to identifier 'hola' can not be used inside a Qrl($) scope because it's a function"
    );
    expect(messages).toContainEqual(
      "Reference to identifier 'Thing' can not be used inside a Qrl($) scope because it's a function"
    );
  });

  it('emits C05 for missing custom inlined Qrl export', () => {
    const input = `
import { component$ as Component, $ as onRender, useStore, wrap, useEffect } from '@qwik.dev/core';


export const useMemo$ = (qrt) => {
\tuseEffect(qrt);
};

export const App = component$((props) => {
\tconst state = useStore({count: 0});
\tuseMemo$(() => {
\t\tconsole.log(state.count);
\t});
\treturn $(() => (
\t\t<div>{state.count}</div>
\t));
});
`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    // Should still produce code
    expect(result.modules.length).toBeGreaterThan(0);

    // Should emit C05 for useMemo$ without useMemoQrl
    const c05Diags = result.diagnostics.filter((d) => d.code === 'C05');
    expect(c05Diags.length).toBe(1);
    expect(c05Diags[0].message).toContain("Found 'useMemo$'");
    expect(c05Diags[0].message).toContain("'useMemoQrl'");
  });

  it('emits preventdefault-passive-check warning', () => {
    const input = `
\t\timport { component$ } from '@qwik.dev/core';

\t\tconst PassiveOnlyComponent = component$(() => {
\t\t\treturn (
\t\t\t\t<div>
\t\t\t\t\t<button passive:click preventdefault:click onClick$={() => {}}>
\t\t\t\t\t\tclick
\t\t\t\t\t</button>
\t\t\t\t</div>
\t\t\t);
\t\t});
\t\t`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    const passiveDiags = result.diagnostics.filter(
      (d) => d.code === 'preventdefault-passive-check'
    );
    expect(passiveDiags.length).toBe(1);
    expect(passiveDiags[0].category).toBe('warning');
    expect(passiveDiags[0].message).toContain('preventdefault:click');
    expect(passiveDiags[0].message).toContain('passive:click');
  });

  it('suppresses diagnostics with @qwik-disable-next-line', () => {
    const input = `
\t\timport { component$ } from '@qwik.dev/core';

\t\tconst PassiveOnlyComponent = component$(() => {
\t\t\treturn (
\t\t\t\t<div>
\t\t\t\t\t{/* @qwik-disable-next-line preventdefault-passive-check */}
\t\t\t\t\t<button passive:click preventdefault:click onClick$={() => {}}>
\t\t\t\t\t\tclick
\t\t\t\t\t</button>
\t\t\t\t</div>
\t\t\t);
\t\t});
\t\t`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    // The preventdefault-passive-check should be suppressed
    const passiveDiags = result.diagnostics.filter(
      (d) => d.code === 'preventdefault-passive-check'
    );
    expect(passiveDiags.length).toBe(0);
  });

  it('suppresses C05 with @qwik-disable-next-line', () => {
    const input = `
\t\timport { component$, useEffect } from '@qwik.dev/core';

\t\texport const useMemo$ = (qrt) => {
\t\t\tuseEffect(qrt);
\t\t};

\t\texport const App = component$(() => {
\t\t\t/* @qwik-disable-next-line C05 */
\t\t\tuseMemo$(() => {
\t\t\t\tconsole.log('suppressed');
\t\t\t});
\t\t\treturn <div />;
\t\t});
\t\t`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    const c05Diags = result.diagnostics.filter((d) => d.code === 'C05');
    expect(c05Diags.length).toBe(0);
  });

  it('produces code output even when diagnostics are present', () => {
    const input = `
import { $, component$ } from '@qwik.dev/core';

export const App = component$(() => {
\tfunction hola() { console.log('hi'); }
\treturn $(() => { hola(); return <div />; });
})
`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    // Diagnostics present
    expect(result.diagnostics.length).toBeGreaterThan(0);

    // Code still produced
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.modules[0].code.length).toBeGreaterThan(0);
  });
});
