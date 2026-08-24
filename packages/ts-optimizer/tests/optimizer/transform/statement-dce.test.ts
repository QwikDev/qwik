import { describe, it, expect } from 'vitest';
import { applyStatementDCE } from '../../../src/optimizer/transform/statement-dce.js';

describe('applyStatementDCE', () => {
  it('drops unused pure decls, functions, classes, and empty try/catch', () => {
    const code = [
      'export const seg = (decl1, { decl2 }, [decl3]) => {',
      '  const { decl4, key: decl5 } = this;',
      '  let [decl6, ...decl7] = stuff;',
      '  const decl8 = 1, decl9;',
      '  function decl10(decl11, { decl12 }, [decl13]) {}',
      '  class decl14 {',
      '    method(decl15, { decl16 }, [decl17]) {}',
      '  }',
      '  try {} catch (decl18) {}',
      '  try {} catch ({ decl19 }) {}',
      '};',
    ].join('\n');

    const out = applyStatementDCE(code, 'test.js');

    expect(out).toContain('= this');
    expect(out).toContain('= stuff');
    expect(out).not.toContain('decl8');
    expect(out).not.toContain('decl9');
    expect(out).not.toContain('function decl10');
    expect(out).not.toContain('class decl14');
    expect(out).not.toContain('try');
  });

  it('keeps used declarations and only the initializer of unused side-effectful declarations', () => {
    const code = [
      'export const seg = () => {',
      '  const used = 1;',
      '  const effect = doThing();',
      '  function helper() {}',
      '  helper();',
      '  return used;',
      '};',
    ].join('\n');

    const out = applyStatementDCE(code, 'test.js');

    expect(out).toContain('const used = 1');
    expect(out).toContain('doThing()');
    expect(out).not.toContain('const effect');
    expect(out).toContain('function helper');
  });

  it('keeps classes with static side effects and non-trivial extends', () => {
    const code = [
      'export const seg = () => {',
      '  class WithStatic { static x = compute(); }',
      '  class Extending extends mixin() {}',
      '};',
    ].join('\n');

    const out = applyStatementDCE(code, 'test.js');

    expect(out).toContain('WithStatic');
    expect(out).toContain('Extending');
  });

  it('keeps classes with instance field initializers', () => {
    const code = 'export const seg = () => { class Some { value = external; } };';

    expect(applyStatementDCE(code, 'test.js')).toBe(code);
  });

  it('removes decls freed up by earlier removals (fixpoint)', () => {
    const code = [
      'export const seg = () => {',
      '  const a = 1;',
      '  function b() { return a; }',
      '};',
    ].join('\n');

    const out = applyStatementDCE(code, 'test.js');

    expect(out).not.toContain('const a');
    expect(out).not.toContain('function b');
  });

  it('drops unused transpiled enum bindings without dropping their initializer', () => {
    const code = [
      'var Thing = function(Thing) {',
      '  Thing[Thing["A"] = 0] = "A";',
      '  return Thing;',
      '}(Thing || {});',
      'export const value = 1;',
    ].join('\n');

    const out = applyStatementDCE(code, 'test.js');

    expect(out).not.toContain('var Thing');
    expect(out).not.toContain('Thing || {}');
    expect(out).toContain('})({});');
  });

  it('keeps unused top-level side-effectful bindings', () => {
    const code = 'const Header = componentQrl(q_Header);';

    expect(applyStatementDCE(code, 'test.js')).toBe(code);
  });

  it('keeps only reads from an unused binary initializer', () => {
    const code = 'export const seg = () => { const unused = left + right; };';

    expect(applyStatementDCE(code, 'test.js')).toBe('export const seg = () => { left, right; };');
  });
});
