import fs from 'node:fs';
import { join } from 'node:path';
import { getErrorHtml } from '../../../middleware/request-handler/error-handler';

/** Cleans the client output SSG results if needed and injects the SSG metadata into the build output */
export async function postBuild(
  clientOutDir: string,
  serverOutDir: string,
  pathName: string,
  userStaticPaths: string[],
  cleanStatic: boolean
) {
  if (pathName && !pathName.endsWith('/')) {
    pathName += '/';
  }
  const ignorePathnames = new Set([
    pathName + '/' + (globalThis.__QWIK_BUILD_DIR__ || 'build') + '/',
    pathName + '/' + (globalThis.__QWIK_ASSETS_DIR__ || 'assets') + '/',
  ]);

  const staticPaths = new Set(userStaticPaths.map(normalizeTrailingSlash));
  const notFounds: string[][] = [];

  const loadItem = async (fsDir: string, fsName: string, pathname: string) => {
    pathname = normalizeTrailingSlash(pathname);
    if (ignorePathnames.has(pathname)) {
      return;
    }

    const fsPath = join(fsDir, fsName);

    if (fsName === 'index.html' || fsName === 'q-data.json') {
      // static index.html file
      if (!staticPaths.has(pathname) && cleanStatic) {
        await fs.promises.unlink(fsPath);
      }
      return;
    }

    if (fsName === '404.html') {
      // static 404.html file
      const notFoundHtml = await fs.promises.readFile(fsPath, 'utf-8');
      notFounds.push([pathname, notFoundHtml]);
      return;
    }

    const stat = await fs.promises.stat(fsPath);
    if (stat.isDirectory()) {
      await loadDir(fsPath, pathname + fsName + '/');
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

  const notFoundPathsCode = createNotFoundPathsCode(pathName, notFounds);
  const staticPathsCode = createStaticPathsCode(staticPaths);

  await injectStatics(staticPathsCode, notFoundPathsCode, serverOutDir);
}

function normalizeTrailingSlash(pathname: string) {
  if (!pathname.endsWith('/')) {
    return pathname + '/';
  }
  return pathname;
}

function createNotFoundPathsCode(basePathname: string, notFounds: string[][]) {
  /** Sort in order of longest path, so that the most specific paths match first */
  notFounds.sort((a, b) => {
    if (a[0].length > b[0].length) {
      return -1;
    }
    if (a[0].length < b[0].length) {
      return 1;
    }
    if (a[0] < b[0]) {
      return -1;
    }
    if (a[0] > b[0]) {
      return 1;
    }
    return 0;
  });

  if (!notFounds.some((r) => r[0] === basePathname)) {
    const html = getErrorHtml(404, 'Resource Not Found');
    notFounds.push([basePathname, html]);
  }

  // This is the body of the not found array
  return JSON.stringify(notFounds, null, 2).slice(1, -1);
}

function createStaticPathsCode(staticPaths: Set<string>) {
  // This is the body of the static paths array
  return JSON.stringify(Array.from(new Set<string>(staticPaths)).sort()).slice(1, -1);
}

const injectStatics = async (
  staticPathsCode: string,
  notFoundPathsCode: string,
  outDir: string
) => {
  const promises = new Set<Promise<void>>();
  // replace the placeholders in the build output with the actual values
  const doReplace = async (path: string) => {
    const code = await fs.promises.readFile(path, 'utf-8');

    let replaced = false;
    const newCode = code.replace(
      /(['"])__QWIK_ROUTER_(STATIC_PATHS|NOT_FOUND)_ARRAY__\1/g,
      (_, _quote, type) => {
        replaced = true;
        return type === 'STATIC_PATHS' ? staticPathsCode : notFoundPathsCode;
      }
    );
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
