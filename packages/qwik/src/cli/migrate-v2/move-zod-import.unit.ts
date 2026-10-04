import { Project } from 'ts-morph';
import { expect, test } from 'vitest';
import { moveZodImport } from './move-zod-import';

const migrate = (source: string) => {
  const sourceFile = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', source);
  const hasChanges = moveZodImport(sourceFile);
  return { hasChanges, output: sourceFile.getFullText() };
};

test('moves z from the router import to zod', () => {
  const { hasChanges, output } = migrate(
    `import { routeAction$, z, zod$ } from '@builder.io/qwik-city';\n`
  );
  expect(hasChanges).toBe(true);
  expect(output).toContain(`import { routeAction$, zod$ } from '@builder.io/qwik-city';`);
  expect(output).toMatch(/import \{ z \} from ["']zod["'];/);
});

test('removes a router import that only imported z and keeps the alias', () => {
  const { output } = migrate(`import { z as zod } from '@qwik.dev/router';\nzod.string();\n`);
  expect(output).not.toContain('@qwik.dev/router');
  expect(output).toMatch(/import \{ z as zod \} from ["']zod["'];/);
});

test('leaves files without a router z import untouched', () => {
  const source = `import { z } from 'zod';\nimport { zod$ } from '@qwik.dev/router';\n`;
  expect(migrate(source)).toEqual({ hasChanges: false, output: source });
});
