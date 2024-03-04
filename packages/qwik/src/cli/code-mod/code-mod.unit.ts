import { test, assert } from 'vitest';
import { updateViteConfig } from './code-mod';
import ts from 'typescript';

const prepareOutput = (str: string) =>
  str
    .split('\n')
    .map((part) => part.trim())
    .join('\n');

test('update existing qwik vite plugin config prop', () => {
  const sourceText = `
    export default defineConfig(() => {
      return {
        plugins: [
          qwikVite({ssr:false}),
        ],
      };
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    qwikViteConfig: { ssr: `{ outDir: 'netlify/edge-functions/entry.netlify' }` },
  })!;
  assert.include(
    outputText,
    'qwikVite({ ssr: { outDir: "netlify/edge-functions/entry.netlify" } })'
  );
});

test('update qwik vite plugin config', () => {
  const sourceText = `
    export default defineConfig(() => {
      return {
        plugins: [
          qwikVite({abc:88}),
        ],
      };
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    qwikViteConfig: { ssr: `{ outDir: 'netlify/edge-functions/entry.netlify' }` },
  })!;
  assert.include(
    outputText,
    'qwikVite({ ssr: { outDir: "netlify/edge-functions/entry.netlify" }, abc: 88 })'
  );
});

test('add qwik vite plugin config', () => {
  const sourceText = `
    export default defineConfig(() => {
      return {
        plugins: [
          qwikVite(),
        ],
      };
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    qwikViteConfig: { ssr: `{ outDir: 'netlify/edge-functions/entry.netlify' }` },
  })!;
  assert.include(
    outputText,
    'qwikVite({ ssr: { outDir: "netlify/edge-functions/entry.netlify" } })'
  );
});

test('add qwik vite plugin config for object based vite config', () => {
  const sourceText = `
    export default defineConfig({
      plugins: [
        qwikVite(),
      ],
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    qwikViteConfig: { ssr: `{ outDir: 'netlify/edge-functions/entry.netlify' }` },
  })!;
  assert.include(
    outputText,
    'qwikVite({ ssr: { outDir: "netlify/edge-functions/entry.netlify" } })'
  );
});

test('add vite plugin', () => {
  const sourceText = `
    export default defineConfig(() => {
      return {
        plugins: [
          qwikVite(),
        ],
      };
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    vitePlugins: [`netlifyEdge({ functionName: 'entry.netlify' })`],
  })!;
  assert.include(outputText, 'netlifyEdge({ functionName: "entry.netlify" })');
});

test('add vite plugin to object based config', () => {
  const sourceText = `
    export default defineConfig({
      plugins: [
        qwikVite(),
      ],
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    vitePlugins: [`netlifyEdge({ functionName: 'entry.netlify' })`],
  })!;
  assert.include(outputText, 'netlifyEdge({ functionName: "entry.netlify" })');
});

test('should not add vite plugin if it is already defined', () => {
  const sourceText = `
  export default defineConfig(() => {
    return {
      plugins: [
        qwikVite(),
        netlifyEdge()
      ],
    };
  });
`;
  const outputText = updateViteConfig(ts, sourceText, {
    vitePlugins: [`netlifyEdge({ functionName: 'entry.netlify' })`],
  })!;

  const expected = `export default defineConfig(() => {
        return {
          plugins: [
            qwikVite(),
            netlifyEdge()
          ]
        };
      });
    `;
  assert.deepEqual(prepareOutput(outputText), prepareOutput(expected));
});

test('update vite config', () => {
  const sourceText = `
    export default defineConfig(() => {
      return {
        ssr: {},
        plugins: [
          qwikVite(),
        ],
      };
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    viteConfig: { ssr: `{ target: 'webworker', noExternal: true }` },
  })!;
  assert.include(outputText, 'ssr: { target: "webworker", noExternal: true');
});

test('update object based vite config', () => {
  const sourceText = `
    export default defineConfig({
      ssr: {},
      plugins: [
        qwikVite(),
      ],
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    viteConfig: { ssr: `{ target: 'webworker', noExternal: true }` },
  })!;
  assert.include(outputText, 'ssr: { target: "webworker", noExternal: true');
});

test('add vite config', () => {
  const sourceText = `
    export default defineConfig(() => {
      return {
        plugins: [
          qwikVite(),
        ],
      };
    });
  `;
  const outputText = updateViteConfig(ts, sourceText, {
    viteConfig: { ssr: `{ target: 'webworker', noExternal: true }` },
  })!;
  assert.include(outputText, 'ssr: { target: "webworker", noExternal: true');
});

test('add imports to side effect default import', () => {
  const sourceText = `import a from "@builder.io/qwik";`;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [
      { namedImports: ['b'], importPath: '@builder.io/qwik' },
      { namedImports: ['c', 'd'], importPath: '@builder.io/sdk-react' },
    ],
  })!;
  assert.include(outputText, 'import a, { b } from "@builder.io/qwik";');
  assert.include(outputText, 'import { c, d } from "@builder.io/sdk-react";');
});

test('do not re-add named imports', () => {
  const sourceText = `
    import { a } from "@builder.io/qwik";
    import { b, c } from "@builder.io/sdk-react";
    `;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [
      { namedImports: ['a'], importPath: '@builder.io/qwik' },
      { namedImports: ['b', 'c'], importPath: '@builder.io/sdk-react' },
    ],
  })!;
  assert.include(outputText, 'import { a } from "@builder.io/qwik";');
  assert.include(outputText, 'import { b, c } from "@builder.io/sdk-react";');
});

test('add imports to side effect import', () => {
  const sourceText = `import "@builder.io/qwik";\nconsole.log(88);`;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [{ namedImports: ['a'], importPath: '@builder.io/qwik' }],
  })!;
  assert.include(outputText, 'import { a } from "@builder.io/qwik"');
});

test('leave existing imports', () => {
  const sourceText = `import { a } from "@builder.io/qwik";`;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [{ namedImports: ['b'], importPath: '@builder.io/qwik' }],
  })!;
  assert.include(outputText, 'import { a, b } from "@builder.io/qwik";');
});

test('renamed default import with existing named import', () => {
  const sourceText = `import a, { b } from '@builder.io/sdk-react'`;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [
      { defaultImport: 'c', importPath: '@builder.io/sdk-react' },
      { namedImports: ['d'], importPath: '@builder.io/qwik' },
    ],
  })!;
  assert.include(outputText, 'import c, { b } from "@builder.io/sdk-react";');
  assert.include(outputText, 'import { d } from "@builder.io/qwik";');
});

test('renamed default import', () => {
  const sourceText = `import a from '@builder.io/sdk-react'`;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [{ defaultImport: 'b', importPath: '@builder.io/sdk-react' }],
  })!;
  assert.include(outputText, 'import b from "@builder.io/sdk-react";');
});

test('add default import to empty file', () => {
  const sourceText = ``;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [{ defaultImport: 'a', importPath: '@builder.io/sdk-react' }],
  })!;
  assert.include(outputText, 'import a from "@builder.io/sdk-react";');
});

test('add named imports to empty file', () => {
  const sourceText = ``;
  const outputText = updateViteConfig(ts, sourceText, {
    imports: [{ namedImports: ['a'], importPath: '@builder.io/sdk-react' }],
  })!;
  assert.include(outputText, 'import { a } from "@builder.io/sdk-react";');
});
