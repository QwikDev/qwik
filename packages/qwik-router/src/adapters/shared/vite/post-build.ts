import fs from 'node:fs';
import { join } from 'node:path';
import { LOADER_REGEX } from '../../../middleware/request-handler/request-path';
import { ensureSlash } from '../../../utils/pathname';

/** Cleans the client output SSG results if needed and injects the SSG metadata into the build output */
export async function postBuild(
  clientOutDir: string,
  serverOutDir: string,
  basePathname: string,
  assetsDir: string | undefined,
  userStaticPaths: string[],
  cleanStatic: boolean
) {
  const pathNameBase = ensureSlash(basePathname || '/');
  const normalizedAssetsDir = assetsDir ? assetsDir.replace(/^\/+|\/+$/g, '') : '';
  const nestedDirBase = normalizedAssetsDir
    ? pathNameBase + normalizedAssetsDir + '/'
    : pathNameBase;
  // Also injected for the runtime isStaticPath prefix checks.
  const staticPathPrefixes = [
    nestedDirBase + (globalThis.__QWIK_BUILD_DIR__ || 'build') + '/',
    nestedDirBase + (globalThis.__QWIK_ASSETS_DIR__ || 'assets') + '/',
  ];
  const ignorePathnames = new Set(staticPathPrefixes);

  // Only file-like paths keep the raw unslashed form.
  const staticPaths = new Set(
    userStaticPaths.flatMap((p) => (/\.[^/]*$/.test(p) ? [p, ensureSlash(p)] : [ensureSlash(p)]))
  );

  const loadItem = async (fsDir: string, fsName: string, pathname: string) => {
    pathname = ensureSlash(pathname);
    if (ignorePathnames.has(pathname)) {
      return;
    }

    const fsPath = join(fsDir, fsName);

    if (fsName === 'index.html') {
      // The route pathname already represents this page; clean it if that route is no longer static.
      if (!staticPaths.has(pathname) && cleanStatic) {
        await fs.promises.unlink(fsPath);
      }
      return;
    }

    if (LOADER_REGEX.test('/' + fsName)) {
      // List the exact sidecar SSG wrote so isStaticPath only claims loaders with data on disk.
      if (staticPaths.has(pathname)) {
        staticPaths.add(pathname + fsName);
      } else if (cleanStatic) {
        await fs.promises.unlink(fsPath);
      }
      return;
    }

    const stat = await fs.promises.stat(fsPath);
    if (stat.isDirectory()) {
      await loadDir(fsPath, ensureSlash(pathname + fsName));
    } else if (stat.isFile()) {
      staticPaths.add(pathname + fsName);
    }
  };

  const loadDir = async (fsDir: string, pathname: string) => {
    const itemNames = await fs.promises.readdir(fsDir);
    await Promise.all(itemNames.map((i) => loadItem(fsDir, i, pathname)));
  };

  if (fs.existsSync(clientOutDir)) {
    await loadDir(clientOutDir, pathNameBase);
  }

  const staticPathsCode = toArrayBody([...staticPaths].sort());
  const staticPathPrefixesCode = toArrayBody(staticPathPrefixes);
  await injectStatics(staticPathsCode, staticPathPrefixesCode, serverOutDir);
}

function toArrayBody(values: string[]) {
  // An array literal's body, without the surrounding brackets.
  return JSON.stringify(values).slice(1, -1);
}

const injectStatics = async (
  staticPathsCode: string,
  staticPathPrefixesCode: string,
  outDir: string
) => {
  const promises = new Set<Promise<void>>();
  const doReplace = async (path: string) => {
    const code = await fs.promises.readFile(path, 'utf-8');
    const newCode = code
      .replace(/(['"])__QWIK_ROUTER_STATIC_PATHS_ARRAY__\1/g, () => staticPathsCode)
      .replace(/(['"])__QWIK_ROUTER_STATIC_PATHS_PREFIXES__\1/g, () => staticPathPrefixesCode);
    if (newCode !== code) {
      await fs.promises.writeFile(path, newCode);
    }
  };
  const walk = async (dir: string) => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name));
      } else if (entry.name.endsWith('js')) {
        const p = doReplace(join(dir, entry.name)).finally(() => {
          promises.delete(p);
        });
        promises.add(p);
      }
    }
  };
  await walk(outDir);
  await Promise.all(promises);
};
