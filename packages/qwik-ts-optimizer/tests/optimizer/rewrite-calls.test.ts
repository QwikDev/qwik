import { describe, it, expect } from 'vitest';
import {
  getQrlCalleeName,
  buildQrlDeclaration,
  buildSyncTransform,
  needsPureAnnotation,
  getQrlImportSource,
} from '../../src/optimizer/rewrite-calls.js';

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
