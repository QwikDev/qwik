import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  getQrlCalleeName,
  buildQrlDeclaration,
  buildSyncTransform,
  needsPureAnnotation,
  getQrlImportSource,
} from '../../../src/optimizer/rewrite/rewrite-calls.js';

describe('getQrlCalleeName', () => {
  it('component$ returns componentQrl', () => {
    expect(getQrlCalleeName('component$')).toBe('componentQrl');
  });

  it('$ returns empty string (bare)', () => {
    expect(getQrlCalleeName('$')).toBe('');
  });

  it('sync$ returns _qrlSync', () => {
    expect(getQrlCalleeName('sync$')).toBe('_qrlSync');
  });

  it('useTask$ returns useTaskQrl', () => {
    expect(getQrlCalleeName('useTask$')).toBe('useTaskQrl');
  });

  it('server$ returns serverQrl', () => {
    expect(getQrlCalleeName('server$')).toBe('serverQrl');
  });
});

describe('buildQrlDeclaration', () => {
  it('produces correct format with PURE annotation', () => {
    const result = buildQrlDeclaration('App_component_abc12345678', 'App_component_abc12345678');
    expect(result).toBe(
      'const q_App_component_abc12345678 = /*#__PURE__*/ qrl(()=>import("./App_component_abc12345678"), "App_component_abc12345678");'
    );
  });
});

describe('buildSyncTransform', () => {
  it('produces _qrlSync(fn, "minified") format', () => {
    const originalFn = '(event, target) => {\n  event.preventDefault();\n}';
    const result = buildSyncTransform(originalFn);
    expect(result).toContain('_qrlSync(');
    expect(result).toContain(originalFn);
    // Should have a minified string as second argument
    expect(result).toMatch(/_qrlSync\([\s\S]+,\s*"/);
  });

  it('single-quote-wraps a serialized body containing double-quote string literals', () => {
    const result = buildSyncTransform('(e, el) => { console.log("drop"); }');
    expect(result).toContain(`'(e,el)=>`);
    expect(result).toContain('console.log("drop")');
    expect(parseSync('t.tsx', result, { lang: 'tsx' }).errors).toHaveLength(0);
  });

  it('keeps double-quote wrapping when the body has no double quotes', () => {
    const result = buildSyncTransform('(event, target) => { event.preventDefault(); }');
    expect(result).toContain('"(event,target)=>');
    expect(parseSync('t.tsx', result, { lang: 'tsx' }).errors).toHaveLength(0);
  });

  const serializedArg = (originalFnText: string): string => {
    const result = buildSyncTransform(originalFnText);
    const prefix = `_qrlSync(${originalFnText}, `;
    const inner = result.slice(prefix.length, -1);
    return inner.slice(1, -1);
  };

  it('strips TS annotations from the serialized string of a block-body arrow', () => {
    const serialized = serializedArg('(e: KeyboardEvent): void => { e.preventDefault(); }');
    expect(serialized).not.toContain('KeyboardEvent');
    expect(serialized).not.toMatch(/:\s*void/);
    expect(serialized).toBe(serializedArg('(e) => { e.preventDefault(); }'));
  });

  it('strips TS annotations from the serialized string of an expression-body arrow', () => {
    const serialized = serializedArg('(e: MouseEvent): void => e.preventDefault()');
    expect(serialized).not.toContain('MouseEvent');
    expect(serialized).not.toMatch(/:\s*void/);
    expect(serialized).toBe(serializedArg('(e) => e.preventDefault()'));
  });

  it('strips TS annotations from the serialized string of a function expression', () => {
    const serialized = serializedArg('function(e: Event, t: EventTarget): void { e.preventDefault(); }');
    expect(serialized).not.toContain('Event');
    expect(serialized).not.toContain('EventTarget');
    expect(serialized).not.toMatch(/:\s*void/);
    expect(serialized).toBe(serializedArg('function(e, t) { e.preventDefault(); }'));
  });

  it('keeps the live first argument raw, including its TS annotation', () => {
    const originalFn = '(e: KeyboardEvent): void => { e.preventDefault(); }';
    expect(buildSyncTransform(originalFn)).toContain(`_qrlSync(${originalFn},`);
  });

  it('leaves a TS-free body unchanged (no-op guard)', () => {
    expect(serializedArg('(event, target) => { event.preventDefault(); }')).toBe(
      '(event,target)=>{event.preventDefault();}',
    );
    expect(serializedArg('(event) => { event.preventDefault(); }')).toBe(
      'event=>{event.preventDefault();}',
    );
  });
});

describe('needsPureAnnotation', () => {
  it('returns true for componentQrl', () => {
    expect(needsPureAnnotation('componentQrl')).toBe(true);
  });

  it('returns true for qrl', () => {
    expect(needsPureAnnotation('qrl')).toBe(true);
  });

  it('returns false for useTaskQrl', () => {
    expect(needsPureAnnotation('useTaskQrl')).toBe(false);
  });

  it('returns false for useStylesQrl', () => {
    expect(needsPureAnnotation('useStylesQrl')).toBe(false);
  });
});

describe('getQrlImportSource', () => {
  it('returns @qwik.dev/react for qwikifyQrl', () => {
    expect(getQrlImportSource('qwikifyQrl')).toBe('@qwik.dev/react');
  });

  it('returns @qwik.dev/core for componentQrl', () => {
    expect(getQrlImportSource('componentQrl')).toBe('@qwik.dev/core');
  });
});
