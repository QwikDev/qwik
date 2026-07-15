import { SourceMap } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformModules } from './index';

describe('compiler source maps', () => {
  it('maps main, component, and segment modules back to the original TSX', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
type Props = { label: string };
export function Button(props: Props) {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{props.label}: {count.value}</button>;
}
export function App(props: Props) {
  return <Button label={props.label} />;
}
`;
    const result = await transformModules({
      input: [{ path: 'src/component.tsx', code }],
      srcDir: 'src',
      sourceMaps: true,
      transpileTs: true,
      transpileJsx: true,
      isServer: false,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules.length).toBeGreaterThan(1);
    for (const module of result.modules) {
      expect(module.map, module.path).not.toBeNull();
      const map = JSON.parse(module.map!);
      expect(map.sources).toContain('src/component.tsx');
      expect(map.sourcesContent).toContain(code);
    }
    const component = result.modules.find((module) => module.path.includes('_component_Button'))!;
    const event = result.modules.find((module) => module.path.includes('_q_e_click_'))!;
    const componentMap = JSON.parse(component.map!);
    const componentTrace = new SourceMap({
      ...componentMap,
      file: componentMap.file ?? '',
      sourceRoot: componentMap.sourceRoot ?? '',
    });
    const componentEntry = componentTrace.findEntry(0, 0);
    expect(componentEntry).toMatchObject({
      originalSource: 'src/component.tsx',
      originalLine: 2,
    });
    expect(code.slice(...component.segment!.loc)).toContain('function Button(props: Props)');
    expect(code.slice(...event.segment!.loc)).toBe('onClick$={() => count.value++}');
  });

  it('reports qualified shape diagnostics in original TSX coordinates', async () => {
    const code = `type Props = { ok: boolean };
export function App(props: Props) {
  if (props.ok) return <b>yes</b>;
  return <i>no</i>;
}
`;
    const result = await transformModules({
      input: [{ path: 'src/component.tsx', code }],
      srcDir: 'src',
      sourceMaps: true,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });

    expect(result.diagnostics).toHaveLength(1);
    const highlight = result.diagnostics[0].highlights?.[0];
    expect(result.diagnostics[0].code).toBe('unsupported-component-shape');
    expect(highlight).not.toBeUndefined();
    expect(code.slice(highlight!.lo, highlight!.hi)).toContain('if');
  });
});
