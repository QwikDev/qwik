/**
 * Tests for the shared q:p collection walk — the JSX walk both emit paths
 * (segment codegen and inline/hoist strategy) use to map elements to the
 * capture params their event-handler attributes require.
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walkAstForQp } from '../../../src/optimizer/jsx/qp-walk.js';

function qpFor(
  source: string,
  paramsByQrl: Record<string, string[]>,
): { qpOverrides: Map<number, string[]>; qrlsWithCaptures: Set<string> } {
  const { program } = parseSync('test.tsx', source);
  const map = new Map(Object.entries(paramsByQrl));
  const qpOverrides = new Map<number, string[]>();
  const qrlsWithCaptures = new Set<string>();
  walkAstForQp(program, (name) => map.get(name), qpOverrides, qrlsWithCaptures);
  return { qpOverrides, qrlsWithCaptures };
}

describe('walkAstForQp', () => {
  it('collects params for an event-handler attr referencing a known QRL', () => {
    const { qpOverrides, qrlsWithCaptures } = qpFor(
      `const x = <div onClick$={q_handler}/>;`,
      { q_handler: ['item'] },
    );
    expect([...qpOverrides.values()]).toEqual([['item']]);
    expect([...qrlsWithCaptures]).toEqual(['q_handler']);
  });

  it('recognises already-rewritten q-*: attribute names', () => {
    const { qpOverrides } = qpFor(
      `const x = <div q-e:click={q_handler}/>;`,
      { q_handler: ['item'] },
    );
    expect([...qpOverrides.values()]).toEqual([['item']]);
  });

  it('dedupes params across multiple handlers on one element', () => {
    const { qpOverrides } = qpFor(
      `const x = <div onClick$={q_a} onInput$={q_b}/>;`,
      { q_a: ['item', 'i'], q_b: ['i', 'list'] },
    );
    expect([...qpOverrides.values()]).toEqual([['item', 'i', 'list']]);
  });

  it('keys overrides by element start offset, per element', () => {
    const source = `const x = <div onClick$={q_a}><span onClick$={q_b}/></div>;`;
    const { qpOverrides } = qpFor(source, { q_a: ['a'], q_b: ['b'] });
    expect(qpOverrides.size).toBe(2);
    expect(qpOverrides.get(source.indexOf('<div'))).toEqual(['a']);
    expect(qpOverrides.get(source.indexOf('<span'))).toEqual(['b']);
  });

  it('ignores non-event attributes and unknown QRL names', () => {
    const { qpOverrides, qrlsWithCaptures } = qpFor(
      `const x = <div class={q_handler} onClick$={q_unknown}/>;`,
      { q_handler: ['item'] },
    );
    expect(qpOverrides.size).toBe(0);
    expect(qrlsWithCaptures.size).toBe(0);
  });

  it('ignores non-Identifier handler values', () => {
    const { qpOverrides } = qpFor(
      `const x = <div onClick$={() => q_handler()}/>;`,
      { q_handler: ['item'] },
    );
    expect(qpOverrides.size).toBe(0);
  });

  it('omits elements whose handlers resolve to no params', () => {
    const { qpOverrides } = qpFor(
      `const x = <div onClick$={q_a}/>;`,
      {},
    );
    expect(qpOverrides.size).toBe(0);
  });

  it('works without a qrlsWithCaptures sink', () => {
    const { program } = parseSync('test.tsx', `const x = <div onClick$={q_a}/>;`);
    const qpOverrides = new Map<number, string[]>();
    walkAstForQp(program, () => ['item'], qpOverrides);
    expect(qpOverrides.size).toBe(1);
  });
});
