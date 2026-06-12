import fs from 'node:fs';
import { join } from 'node:path';
import { LOADER_REGEX } from '../../../middleware/request-handler/request-path';
import { ensureSlash } from '../../../utils/pathname';

/** Cleans the client output SSG results if needed and injects the SSG metadata into the build output */
export async function postBuild(
  clientOutDir: string,
  serverOutDir: string,
  pathName: string,
  userStaticPaths: string[],
  cleanStatic: boolean
) {
  if (pathName && !pathName.endsWith('/')) {
    pathName = ensureSlash(pathName);
  }
  const pathNameBase = pathName || '/';
  const pathSegment = pathNameBase.split('/').filter(Boolean).pop();
  const ignorePathnames = new Set([
    pathNameBase + (globalThis.__QWIK_BUILD_DIR__ || 'build') + '/',
    pathNameBase + (globalThis.__QWIK_ASSETS_DIR__ || 'assets') + '/',
  ]);

  const staticPaths = new Set(userStaticPaths.map((p) => normalizeStaticPath(p, pathNameBase)));

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
      const shouldAvoidDuplicateSegment =
        !!pathSegment && fsName === pathSegment && pathname.endsWith(`${pathSegment}/`);
      const nextPathname = shouldAvoidDuplicateSegment ? pathname : ensureSlash(pathname + fsName);
      await loadDir(fsPath, nextPathname);
    } else if (stat.isFile()) {
      staticPaths.add(pathname + fsName);
    }
  };

  const loadDir = async (fsDir: string, pathname: string) => {
    const itemNames = await fs.promises.readdir(fsDir);
    await Promise.all(itemNames.map((i) => loadItem(fsDir, i, pathname)));
  };

  if (fs.existsSync(clientOutDir)) {
    await loadDir(clientOutDir, pathName);
  }

  const staticPathsCode = createStaticPathsCode(staticPaths);

  await injectStatics(staticPathsCode, serverOutDir);
}

function normalizeStaticPath(pathname: string, pathNameBase: string) {
  const normalized = ensureLeadingSlash(ensureSlash(pathname));
  const normalizedPathNameBase = ensureLeadingSlash(ensureSlash(pathNameBase));
  const segment = normalizedPathNameBase.split('/').filter(Boolean).pop();

  if (!segment) {
    return normalized;
  }

  const doubledSegmentPrefix = `${normalizedPathNameBase}${segment}/`;
  if (normalized.startsWith(doubledSegmentPrefix)) {
    return normalizedPathNameBase + normalized.slice(doubledSegmentPrefix.length);
  }

  return normalized;
}

function ensureLeadingSlash(pathname: string) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function createStaticPathsCode(staticPaths: Set<string>) {
  // This is the body of the static paths array
  return JSON.stringify(Array.from(new Set<string>(staticPaths)).sort()).slice(1, -1);
}

const injectStatics = async (staticPathsCode: string, outDir: string) => {
  const promises = new Set<Promise<void>>();
  // replace the static-paths placeholder in the build output with the actual values
  const doReplace = async (path: string) => {
    const code = await fs.promises.readFile(path, 'utf-8');

    let replaced = false;
    const newCode = code.replace(/(['"])__QWIK_ROUTER_STATIC_PATHS_ARRAY__\1/g, () => {
      replaced = true;
      return staticPathsCode;
    });
    if (replaced) {
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
