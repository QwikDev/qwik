import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { removeQwikCityPlan } from './entries';
import type { Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('entry.tsx', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('removeQwikCityPlan', () => {
  test('removes the option and the unused import', () => {
    const { changed, text } = run(
      removeQwikCityPlan,
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';`,
        `import qwikCityPlan from '@qwik-city-plan';`,
        `import render from './entry.ssr';`,
        `export default createQwikCity({ render, qwikCityPlan });`,
      ].join('\n')
    );
    expect(changed).toBe(true);
    expect(text).toBe(
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';`,
        `import render from './entry.ssr';`,
        `export default createQwikCity({ render });`,
      ].join('\n')
    );
  });

  test('removes a non-shorthand option and keeps an import that is still used', () => {
    const { text } = run(
      removeQwikCityPlan,
      [
        `import { createQwikCity as create } from '@builder.io/qwik-city/middleware/node';`,
        `import plan from '@qwik-city-plan';`,
        `console.log(plan.routes);`,
        `const { router } = create({`,
        `  render,`,
        `  qwikCityPlan: plan,`,
        `  static: {},`,
        `});`,
      ].join('\n')
    );
    expect(text).toBe(
      [
        `import { createQwikCity as create } from '@builder.io/qwik-city/middleware/node';`,
        `import plan from '@qwik-city-plan';`,
        `console.log(plan.routes);`,
        `const { router } = create({`,
        `  render,`,
        `  static: {},`,
        `});`,
      ].join('\n')
    );
  });

  test('ignores functions not imported from qwik-city middleware', () => {
    const code = `import { createQwikCity } from './mine';\ncreateQwikCity({ qwikCityPlan });`;
    expect(run(removeQwikCityPlan, code)).toEqual({ changed: false, text: code });
  });
});
