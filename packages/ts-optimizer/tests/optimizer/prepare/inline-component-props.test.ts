import { describe, it, expect } from 'vitest';
import { normalizeInlineComponentProps } from '../../../src/optimizer/prepare/inline-component-props.js';

describe('normalizeInlineComponentProps', () => {
  it('converts a default-export arrow component with destructured props', () => {
    const code = `export default (({ data }) => <div active={data.on} onClick$={() => { data.on = true; }} />);`;
    const out = normalizeInlineComponentProps(code, 'test.tsx');
    expect(out.changed).toBe(true);
    expect(out.source).toContain('(_rawProps) =>');
    expect(out.source).toContain('active={_rawProps.data.on}');
    expect(out.source).toContain('_rawProps.data.on = true');
  });

  it('converts a named-const arrow component and honors aliases', () => {
    const code = `export const Btn = ({ text: label, color }) => <button color={color}>{label}</button>;`;
    const out = normalizeInlineComponentProps(code, 'test.tsx');
    expect(out.changed).toBe(true);
    expect(out.source).toContain('color={_rawProps.color}');
    expect(out.source).toContain('{_rawProps.text}');
  });

  it('leaves function declarations, marker-wrapped arrows, and non-JSX arrows alone', () => {
    const cases = [
      `export function Button({ text }) { return <button>{text}</button>; }`,
      `export const W = component$(({ text }) => <div>{text}</div>);`,
      `export const add = ({ a, b }) => a + b;`,
    ];
    for (const code of cases) {
      const out = normalizeInlineComponentProps(code, 'test.tsx');
      expect(out.changed, code).toBe(false);
    }
  });

  it('does not rewrite shadowed or non-reference occurrences', () => {
    const code = `export const C = ({ x }) => <div a={{ x: 1 }.x} b={x} />;`;
    const out = normalizeInlineComponentProps(code, 'test.tsx');
    expect(out.changed).toBe(true);
    expect(out.source).toContain('a={{ x: 1 }.x}');
    expect(out.source).toContain('b={_rawProps.x}');
  });
});
