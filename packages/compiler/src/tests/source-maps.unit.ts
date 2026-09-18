import { SourceMap } from 'node:module';
import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { analyseModule, transformModules } from '../index';
import { ModuleKind } from '../schema';

describe('pipeline authored source locations', () => {
  test('keeps normalized and authored import ranges in their own source spaces', async () => {
    const code = `type Count = number;
import { useSignal as signal } from '@qwik.dev/core';
export default () => {
  const count = signal(0 as Count);
  return <p>{count.value}</p>;
};
`;
    const plan = await analyseModule({ path: 'src/imports.tsx', code }, { transpileTs: true });
    const edge = plan.edges[0];
    const imported = plan.imports[0];

    expect(plan.source.code.slice(...edge.ownerRange)).toContain('@qwik.dev/core');
    expect(code.slice(...edge.authoredOwnerRange)).toContain("from '@qwik.dev/core'");
    expect(plan.source.code.slice(...imported.specifierRange)).toBe('signal');
    expect(code.slice(...imported.authoredSpecifierRange)).toBe('signal');
  });

  test('maps diagnostics from normalized code to authored TSX', async () => {
    const code = `type Props = { label: string };
export default (props: Props) => {
  return <p><br>x</br>{props.label}</p>;
};
`;
    const plan = await analyseModule({ path: 'src/bad.tsx', code }, { transpileTs: true });

    expect(plan.kind).toBe(ModuleKind.Failed);
    expect(plan.source.normalizationMap?.sourcesContent).toContain(code);
    expect(plan.diagnostics[0].span).not.toBeNull();
    expect(code.slice(...plan.diagnostics[0].span!)).toBe('<br>x</br>');
  });

  test.each([
    ['SSR', true],
    ['CSR', false],
  ] as const)(
    'maps generated %s modules and segment metadata to authored TSX',
    async (_, isServer) => {
      const code = `import { useSignal } from '@qwik.dev/core';
type Props = { label: string };
export default (props: Props) => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{props.label}</button>;
};
`;
      const output = await transformModules({
        input: [{ path: 'src/counter.tsx', code }],
        srcDir: 'src',
        sourceMaps: true,
        transpileTs: true,
        transpileJsx: true,
        isServer,
      });

      expect(output.modules.length).toBeGreaterThan(1);
      for (const module of output.modules) {
        expect(module.map, module.path).not.toBeNull();
        const map = JSON.parse(module.map!);
        expect(map.sourcesContent).toContain(code);
        expect(posix.normalize(posix.join(posix.dirname(module.path), map.sources[0]))).toBe(
          'src/counter.tsx'
        );
      }

      const event = output.modules.find((module) => module.segment?.ctxKind === 'eventHandler');
      expect(event).toBeDefined();
      expect(code.slice(...event!.segment!.loc)).toContain('onClick$={() => count.value++}');

      const generatedOffset = event!.code.indexOf('count.value++');
      expect(generatedOffset).toBeGreaterThanOrEqual(0);
      const before = event!.code.slice(0, generatedOffset).split('\n');
      const trace = new SourceMap({
        ...JSON.parse(event!.map!),
        file: event!.path,
        sourceRoot: '',
      });
      expect(trace.findEntry(before.length - 1, before.at(-1)!.length)).toMatchObject({
        originalLine: 4,
      });
    }
  );
});
