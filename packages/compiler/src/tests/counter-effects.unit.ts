import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { transformModules } from '../transform-modules';
import { parseModule } from '../analyse/ast/parse';
import { testInputs } from './snapshot-runner';

test.each(['csr', 'ssr'] as const)('%s batches the unannotated benchmark row', async (mode) => {
  const root = new URL('../../../../e2e/qwik-e2e/apps/perf/src/', import.meta.url);
  const output = await testInputs(
    mode,
    'counter-effects',
    ['root.tsx', 'build-data/build-data.ts'].map((path) => ({
      path: `src/${path}`,
      code: readFileSync(new URL(path, root), 'utf8'),
    }))
  );
  expect(output.diagnostics).toEqual([]);
  const code = output.modules.map((module) => module.code).join('\n');
  expect(code).not.toMatch(/createContentBlock|renderSsrContent/);
  expect(code).toContain(mode === 'csr' ? 'createLazyDomBatchEffect(' : 'createSsrDomBatchEffect(');
  const row = output.modules.find((module) => module.path.includes('for_render_segment'))!.code;
  const batch = mode === 'csr' ? /createLazyDomBatchEffect\(/g : /createSsrDomBatchEffect\(/g;
  expect(row.match(batch)).toHaveLength(1);
  expect(row).not.toMatch(/createTextExpressionEffect|createAttrExpressionEffect/);
  if (mode === 'csr') {
    expect(row).toMatch(/function updateRow\d+\(effect\d+, initialParent0, initialParent1\)/);
    expect(row).toMatch(/\.patchText\(/);
    expect(row).toContain('ctx.scheduler, _first(el0), el1)');
    expect(row).toContain('effect0.value0');
    expect(row).toMatch(/else if \(.* !== effect0.value0\)/);
    expect(row).not.toMatch(/createDomBatchEffect\(\(\) =>|let text|let previous/);
  }
});

test.each([
  `<li title={row.label + suffix.value}><b>{row.label + suffix.value}</b></li>`,
  `<li title={row.label}><b>{row.label}</b>{row.id ? <i /> : <em />}</li>`,
  `<li title={row.label}><b>{row.label}</b><section dangerouslySetInnerHTML={row.label} /></li>`,
])('preserves closure batches for outer captures or changing DOM paths', async (row) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    transpileTs: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `
      import { useSignal } from '@qwik.dev/core';
      export const Root = () => {
        const suffix = useSignal('!');
        const rows = useSignal([{ id: 1, label: 'label' }]);
        return <ul>{rows.value.map((row) => (${row}))}</ul>;
      };`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const code = output.modules.find((module) => module.segment?.ctxName === 'for:render')!.code;
  expect(code).toContain('createDomBatchEffect(');
  expect(code).not.toContain('createLazyDomBatchEffect(');
});

test.each(['initialParent0', 'initialText0'])(
  'keeps initial target parameters distinct from %s',
  async (rowName) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: false,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `
      import { useSignal } from '@qwik.dev/core';
      export const Root = () => {
        const rows = useSignal([]);
        return <ul>{rows.value.map(${rowName} =>
          <li title={${rowName}.label.value}><b>{${rowName}.label.value}</b></li>
        )}</ul>;
      };`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const row = output.modules.find((module) => module.segment?.ctxName === 'for:render')!;
    expect(row.code).toContain('createLazyDomBatchEffect(');
    const parsed = parseModule(row.path, row.code);
    expect(parsed.errors).toEqual([]);
    const executable = parsed.program.body
      .filter((statement) => statement.type !== 'ImportDeclaration')
      .map((statement) => {
        const node =
          statement.type === 'ExportNamedDeclaration' ? statement.declaration! : statement;
        return row.code.slice(node.start, node.end);
      })
      .join('\n');
    expect(() => new Function(executable)).not.toThrow();
  }
);
