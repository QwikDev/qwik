/** Names the generators emit never collide with, nor shadow, the author's bindings. */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

async function compile(isServer: boolean, code: string) {
  const output = await transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer,
    input: [{ path: 'src/app.tsx', code }],
  });
  return output.modules.map((module) => module.code).join('\n');
}

describe('runtime helper names', () => {
  // Each target needs the helper for this component: the client binds the click, the server escapes.
  const helpers = [
    { isServer: false, helper: 'setEvent' },
    { isServer: true, helper: 'escapeHTML' },
  ];
  const component = (
    moduleLine: string,
    local = ''
  ) => `import { component$, useSignal } from '@qwik.dev/core';
${moduleLine}
export const A = component$((props: { label: string }) => {
  const count = useSignal(0);${local}
  return <button onClick$={() => count.value++}>{props.label}</button>;
});
`;

  test.each(helpers)(
    'refuses an import that collides with a runtime helper (server: $isServer)',
    async ({ isServer, helper }) => {
      await expect(
        compile(isServer, component(`import { ${helper} } from './analytics';`))
      ).rejects.toThrow(`named "${helper}": it collides with a Qwik runtime helper`);
    }
  );

  test.each(helpers)(
    'refuses a component local that would shadow a runtime helper (server: $isServer)',
    async ({ isServer, helper }) => {
      await expect(
        compile(isServer, component('', `\n  const ${helper} = 1;\n  console.log(${helper});`))
      ).rejects.toThrow(`named "${helper}": it collides with a Qwik runtime helper`);
    }
  );

  test.each(helpers)(
    'keeps a local whose scope holds no generated code (server: $isServer)',
    async ({ isServer, helper }) => {
      const code = await compile(
        isServer,
        component(`export const twin = (${helper}: unknown) => ${helper};`)
      );
      expect(code).toContain(`twin = (${helper}) => ${helper}`);
    }
  );

  test.each([false, true])(
    'keeps an authored core import of a helper the generator also needs (server: %s)',
    async (isServer) => {
      const code = await compile(
        isServer,
        `import { component$, untrack } from '@qwik.dev/core';
import { createTitle } from './defaults';
export const A = component$(({ title = createTitle() }: { title?: string }) => {
  untrack(() => title);
  return <p>{title}</p>;
});
`
      );
      expect(code).toMatch(/untrack\(\(\) => props\.title === void 0\)/);
      expect(
        code.match(/import \{[^}]*\buntrack\b[^}]*\} from "@qwik\.dev\/core"/g)
      ).not.toBeNull();
    }
  );
});
