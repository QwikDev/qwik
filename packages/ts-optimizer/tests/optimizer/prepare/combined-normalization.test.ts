import { describe, expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';

describe('combined input normalization', () => {
  it('applies props and store normalization before extraction', () => {
    const output = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `
            import { component$, useStore } from '@qwik.dev/core';
            export const App = ({ title }) => {
              const Inner = component$(() => {
                const { count } = useStore({ count: 0 });
                return <button>{title}: {count}</button>;
              });
              return <Inner />;
            };
          `,
        },
      ],
      srcDir: '.',
      transpileJsx: true,
    });

    const emitted = output.modules.map((module) => module.code).join('\n');
    expect(emitted).toContain('_wrapProp(_rawProps, "title")');
    expect(emitted).toContain('_wrapProp(store, "count")');
  });
});
