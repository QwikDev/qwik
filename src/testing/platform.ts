import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform } from '@builder.io/qwik';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const testExts = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.jsx'];

const defaultImport = (url: string) => import(url);

const defaultToPath = (url: URL) => {
  const normalizedUrl = new URL(String(url));
  normalizedUrl.hash = '';
  normalizedUrl.search = '';
  const path = fileURLToPath(String(normalizedUrl));
  const importPaths = [path, ...testExts.map((ext) => path + ext)];

  for (const importPath of importPaths) {
    if (existsSync(importPath)) {
      return importPath;
    }
  }

  throw new Error(`Unable to find path for import "${url}"`);
};

const testingPlatform: { current: CorePlatform } = {
  current: {
    import: defaultImport,
    toPath: defaultToPath,
  },
};

export function resetPlatform() {
  testingPlatform.current = {
    import: defaultImport,
    toPath: defaultToPath,
  };
  return setPlatform(testingPlatform.current);
}

export function getPlatform() {
  return testingPlatform.current;
}

export { setPlatform };
