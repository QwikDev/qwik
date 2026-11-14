import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../qwik-e2e/apps/preloader-test'
);
export const PORT = 4318;
export const ORIGIN = `https://localhost:${PORT}`;

type Manifest = {
  preloader?: string;
  bundleGraphAsset?: string;
  bundles: Record<string, { origins?: string[]; symbols?: string[] }>;
  symbols: Record<string, { ctxName?: string }>;
};

let manifest: Manifest | undefined;

export const getManifest = (): Manifest =>
  (manifest ||= JSON.parse(readFileSync(join(APP_DIR, 'dist/q-manifest.json'), 'utf8')));

export const getCoreBundle = () => {
  const { bundles } = getManifest();
  return Object.keys(bundles).find((file) =>
    bundles[file].origins?.some((origin) => /\/core(\.prod|\.min)?\.qwik\.mjs$/.test(origin))
  );
};

let bundleGraph: Map<string, string[]> | undefined;

const getBundleGraph = () => {
  if (!bundleGraph) {
    const path = join(APP_DIR, 'dist', getManifest().bundleGraphAsset!);
    const flat: (string | number)[] = JSON.parse(readFileSync(path, 'utf8'));
    bundleGraph = new Map();
    let deps: string[] = [];
    for (const item of flat) {
      if (typeof item === 'string') {
        deps = [];
        bundleGraph.set(item, deps);
      } else if (item >= 0) {
        // Negative numbers are probability markers, not dependencies.
        deps.push(flat[item] as string);
      }
    }
  }
  return bundleGraph;
};

/** What the preloader marks needed with `bundle`: everything it reaches in the bundle graph. */
export const neededWith = (bundle: string) => {
  const graph = getBundleGraph();
  const needed = new Set<string>();
  const pending = [bundle];
  while (pending.length) {
    for (const dep of graph.get(pending.pop()!) ?? []) {
      if (!needed.has(dep)) {
        needed.add(dep);
        pending.push(dep);
      }
    }
  }
  return needed;
};

const SYMBOL_HASH = /_[A-Za-z0-9]{11}\.js$/;

const labelOrigin = (origin: string) =>
  origin
    .replace(/^src\/components\/fixtures\//, '')
    .replace(/^src\//, '')
    .replace(SYMBOL_HASH, '');

export const bundleFile = (url: string) => new URL(url).pathname.replace(/^\/build\//, '');

export const labelRequest = (url: string) => {
  const { pathname, search } = new URL(url);
  if (pathname.endsWith('-bundle-graph.json')) {
    return 'bundle-graph.json';
  }
  if (!pathname.startsWith('/build/')) {
    return `${pathname}${search}`;
  }
  const file = bundleFile(url);
  const origins = getManifest().bundles[file]?.origins;
  if (!origins?.length || !origins.every((origin) => origin.startsWith('src/'))) {
    return file;
  }
  return [...new Set(origins.map(labelOrigin))].sort().join(' + ');
};

export const chunkComesFrom = (url: string, paths: string[]) => {
  const origins = getManifest().bundles[bundleFile(url)]?.origins ?? [];
  return origins.some((origin) => paths.some((path) => origin.startsWith(path)));
};

export const chunkHoldsSegmentsFrom = (url: string, paths: string[]) =>
  chunkComesFrom(url, paths) && !!getManifest().bundles[bundleFile(url)]?.symbols?.length;

const chunkHasSymbolOf = (url: string, ctxName: string) => {
  const manifest = getManifest();
  return (manifest.bundles[bundleFile(url)]?.symbols ?? []).some(
    (symbol) => manifest.symbols[symbol]?.ctxName === ctxName
  );
};

export const chunkHasScopedStyles = (url: string) => chunkHasSymbolOf(url, 'useStylesScoped$');

export const chunkHasComponent = (url: string) => chunkHasSymbolOf(url, 'component$');

export const chunkUrlsFrom = (path: string) =>
  Object.entries(getManifest().bundles)
    .filter(([, bundle]) => bundle.origins?.some((origin) => origin.startsWith(path)))
    .map(([file]) => `${ORIGIN}/build/${file}`);
