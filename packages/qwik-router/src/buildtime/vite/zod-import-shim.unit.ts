import { expect, test } from 'vitest';
import { moveRouterZodImport } from './zod-import-shim';

test('moves z from a v1 router import to zod', () => {
  expect(
    moveRouterZodImport(`import { globalAction$, zod$, z } from "@builder.io/qwik-city";`)
  ).toBe(`import { globalAction$, zod$ } from "@builder.io/qwik-city";import { z } from "zod";`);
});

test('moves an aliased z from a multi-line router import', () => {
  expect(moveRouterZodImport(`import {\n  zodQrl,\n  z as zod,\n} from '@qwik.dev/router';`)).toBe(
    `import { zodQrl } from '@qwik.dev/router';import { z as zod } from 'zod';`
  );
});

test('replaces an import of only z', () => {
  expect(moveRouterZodImport(`import { z } from '@qwik.dev/router';`)).toBe(
    `import { z } from 'zod';`
  );
});

test('leaves code without a router z import alone', () => {
  expect(moveRouterZodImport(`import { zod$ } from '@qwik.dev/router';`)).toBeNull();
  expect(moveRouterZodImport(`import { z } from 'zod';`)).toBeNull();
});
