import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const buildDir = fileURLToPath(
  new URL('../apps/qwikrouter-test/dist/qwikrouter-test/build/', import.meta.url)
);
const STATIC_IMPORT = /(?:from|import)\s*["'`]\.\/([^"'`]+\.js)["'`]/g;

/** The first chain of static imports that leads from a chunk back to itself. */
function findImportCycle(dir: string): string[] | null {
  const imports = new Map<string, string[]>();
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.js')) {
      const code = readFileSync(dir + file, 'utf8');
      imports.set(
        file,
        Array.from(code.matchAll(STATIC_IMPORT), (match) => match[1])
      );
    }
  }
  const finished = new Set<string>();
  const path: string[] = [];
  const visit = (chunk: string): string[] | null => {
    const seenAt = path.indexOf(chunk);
    if (seenAt !== -1) {
      return [...path.slice(seenAt), chunk];
    }
    if (finished.has(chunk)) {
      return null;
    }
    path.push(chunk);
    for (const imported of imports.get(chunk) ?? []) {
      const cycle = visit(imported);
      if (cycle !== null) {
        return cycle;
      }
    }
    path.pop();
    finished.add(chunk);
    return null;
  };
  for (const chunk of imports.keys()) {
    const cycle = visit(chunk);
    if (cycle !== null) {
      return cycle;
    }
  }
  return null;
}

test('client chunks of a router app import each other without a cycle', async ({ page }) => {
  // The dev server builds an app on its first request.
  await page.goto('/qwikrouter-test/');
  // In a cycle a chunk runs before the chunk it imports from has defined its exports.
  expect(findImportCycle(buildDir)).toBe(null);
});
