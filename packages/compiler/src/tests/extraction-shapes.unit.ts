/** Cutover step 1 seeds: no `$` boundary may survive extraction silently. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';
import { analyseModule } from '../analyse/analyse-module';
import { parseModule } from '../analyse/ast/parse';
import { createBindingGraph } from '../analyse/ast/bindings';
import { createJsxAnalysis } from '../analyse/ast/jsx-analysis';
import { findComponentCandidates } from '../analyse/ast/returns-jsx';
import { scanModuleSurface } from '../analyse/module-surface';
import { emptyModulePlan } from './fixtures';

const options = (code: string, path = 'src/component.tsx') => ({
  input: [{ path, code }],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer: true,
});

const emitted = (output: Awaited<ReturnType<typeof transformModules>>) =>
  output.modules.map((module) => module.code).join('\n');

describe('extraction shapes', () => {
  test('a component$ returned from a plain function becomes a component QRL', async () => {
    const output = await transformModules(
      options(`import { component$ } from '@qwik.dev/core';
export function factory(Component) {
  return component$((props) => <div><Component {...props} /></div>);
}`)
    );
    expect(output.diagnostics).toEqual([]);
    expect(emitted(output)).not.toMatch(/\bcomponent\$\(/);
    expect(emitted(output)).toMatch(/return \(\w+, \w+\) => \{/);
  });

  test('a runtime jsx() call is diagnosed instead of passing through', async () => {
    const output = await transformModules(
      options(`import { component$, jsx } from '@qwik.dev/core';
export const Tree = component$(() => {
  return jsx('div', { children: 'x' });
});`)
    );
    expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['runtime-jsx-call']);
  });

  test('event$ calls its Qrl twin with the extracted QRL', async () => {
    const output = await transformModules(
      options(`import { component$, event$, useStore } from '@qwik.dev/core';
export const Toggle = component$(() => {
  const store = useStore({ on: false });
  const toggle$ = event$(() => { store.on = !store.on; });
  return <button onClick$={toggle$}>t</button>;
});`)
    );
    expect(emitted(output)).toMatch(/\beventQrl\(/);
    expect(emitted(output)).not.toMatch(/\bevent\$\(/);
  });

  test('every discovered component is lowered or diagnosed', async () => {
    const path = resolve(
      __dirname,
      '../../../../e2e/qwik-e2e/apps/e2e/src/components/suspense/suspense.tsx'
    );
    const code = readFileSync(path, 'utf8');
    const plan = await analyseModule({ path: 'src/suspense.tsx', code }, { transpileTs: true });
    const parsed = parseModule('src/suspense.tsx', code);
    const bindings = createBindingGraph(parsed.program);
    const coreBindings = scanModuleSurface(
      parsed.program,
      null,
      emptyModulePlan('src/suspense.tsx', code),
      bindings
    );
    const candidates = findComponentCandidates(
      parsed.program,
      createJsxAnalysis(bindings, coreBindings),
      bindings,
      coreBindings
    );
    const lowered = new Set(plan.qrls.map((qrl) => qrl.declaration?.name));
    const silent = candidates.filter(
      (candidate) => candidate.name !== null && !lowered.has(candidate.name)
    );
    expect(
      silent.map((candidate) => candidate.name),
      'silent rollback'
    ).toEqual(plan.diagnostics.length > 0 ? silent.map((candidate) => candidate.name) : []);
  });
});
