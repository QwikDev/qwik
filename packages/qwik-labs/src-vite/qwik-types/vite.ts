import { readdir, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { type Plugin } from 'vite';
import { generateRouteTypes } from './generator';

export function qwikTypes(): Plugin {
  const srcFolder = join(process.cwd(), 'src');
  const routesFolder = join(srcFolder, 'routes');
  return {
    name: 'Qwik Type Generator',
    async buildStart() {
      await regenerateRoutes(srcFolder, routesFolder);
    },
  };
}

async function regenerateRoutes(srcDir: string, routesDir: string): Promise<Set<string>> {
  assertDirectoryExists(srcDir);
  assertDirectoryExists(routesDir);
  const routes: string[] = [];
  await collectRoutes(routesDir, routesDir, routes);
  routes.sort();
  generateRouteTypes(srcDir, routesDir, routes);
  const seenRoutes = new Set<string>();
  routes.forEach((route) => seenRoutes.add(join(routesDir, route, `index.tsx`)));
  return seenRoutes;
}

async function assertDirectoryExists(directoryPath: string) {
  try {
    const stats = await stat(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`${directoryPath} is not a directory.`);
    }
  } catch (error) {
    throw new Error(`Directory ${directoryPath} does not exist.`);
  }
}

function getRouteDirectory(id: string): string | null {
  const lastSlash = id.lastIndexOf(sep);
  const filename = id.substring(lastSlash + 1);
  if (
    filename.endsWith('index.md') ||
    filename.endsWith('index.mdx') ||
    filename.endsWith('index.js') ||
    filename.endsWith('index.jsx') ||
    filename.endsWith('index.ts') ||
    filename.endsWith('index.tsx')
  ) {
    return id.substring(0, lastSlash + 1);
  }
  return null;
}

async function collectRoutes(base: string, directoryPath: string, routes: string[]) {
  const files = await readdir(directoryPath);
  for (let i = 0; i < files.length; i++) {
    const filePath = join(directoryPath, files[i]);
    const fileStat = await stat(filePath);

    let route: string | null;
    if (fileStat.isDirectory()) {
      await collectRoutes(base, filePath, routes);
    } else if ((route = getRouteDirectory(filePath)) !== null) {
      routes.push(route.substring(base.length).replaceAll(sep, '/'));
    }
  }
}
