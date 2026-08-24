import { expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('orders marker imports before their shared qrl loader', () => {
  const result = transformModule({
    input: [
      {
        path: mkFilePath('test.tsx'),
        code: mkSourceText(`
import { component$ } from '@qwik.dev/core';
import { globalAction$ } from '@qwik.dev/router';
export const action = globalAction$(() => {});
export const App = component$(() => <div/>);
`),
      },
    ],
    srcDir: mkFilePath('.'),
    transpileJsx: true,
  });
  const parent = result.modules.find((module) => module.kind === 'parent');
  if (!parent) {
    throw new Error('parent module not found');
  }

  expect(parent.code.indexOf('import { globalActionQrl }')).toBeLessThan(
    parent.code.indexOf('import { qrl }')
  );
  expect(parent.code.indexOf('import { qrl }')).toBeLessThan(
    parent.code.indexOf('import { componentQrl }')
  );
});
