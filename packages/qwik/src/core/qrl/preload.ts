/**
 * Here we handle preloading of chunks.
 *
 * Given a symbol hash (in fact any string), we can find all the chunks that it depends on, via the
 * bundle graph. We then generate preload link tags for each of those chunks.
 *
 * The priority is set to high for direct imports and low for indirect imports.
 *
 * There are several parts to this:
 *
 * - Load the bundle graph from the preload link tag that was injected during SSR
 * - Given a string, find all the chunks that it depends on
 * - Generate the preload link tags if needed
 */

import { isDev } from '@builder.io/qwik/build';
import type { QwikBundleGraph } from '../../optimizer/src/types';
import { QBaseAttr, QManifestHash } from '../util/markers';

import { QContainerSelector } from '../util/markers';

let bundlesP: Promise<void> | undefined;
enum BundleImportState {
  None,
  Low,
  Loading,
}
type BundleImport = {
  $url$: string | null;
  $state$: BundleImportState;
  $imports$: string[];
  $dynamicImports$: string[];
};
let bundles: Map<string, BundleImport> | undefined;
type WantedBundle = {
  name: string;
  priority: boolean;
};
const wantedBundles: Set<WantedBundle> = new Set();

const parseBundleGraph = (text: string, base: string) => {
  try {
    const graph = JSON.parse(text) as QwikBundleGraph;
    bundles ||= new Map<string, BundleImport>();
    let i = 0;
    while (i < graph.length) {
      const name = graph[i++] as string;
      const url = name.endsWith('.js') ? `${base}${name}` : null;
      const imports: string[] = [];
      const dynamicImports: string[] = [];
      let idx: number | string;
      let collection = imports;
      while (((idx = graph[i]), typeof idx === 'number')) {
        if (idx === -1) {
          collection = dynamicImports;
        } else {
          collection.push(graph[idx] as string);
        }
        i++;
      }
      bundles.set(name, {
        $url$: url,
        $state$: BundleImportState.None,
        $imports$: imports,
        $dynamicImports$: dynamicImports,
      });
    }
    for (const { name, priority } of wantedBundles) {
      preload(name, priority);
    }
    wantedBundles.clear();
  } catch (e) {
    console.error('Error parsing bundle graph', e, text);
    throw e;
  }
};

export const loadBundleGraph = (element: Element) => {
  if (typeof window === 'undefined' || bundlesP) {
    return;
  }
  const container = element.closest(QContainerSelector);
  if (!container) {
    return;
  }
  const hash = container.getAttribute(QManifestHash);
  const base = container.getAttribute(QBaseAttr) || '/';
  const link = hash && (container.querySelector(`link#qwik-bg-${hash}`) as HTMLLinkElement | null);
  if (!link) {
    bundlesP = Promise.reject('No preload link found');
    // prevent uncaught promise rejection
    bundlesP.catch(() => {});
    return;
  }
  bundlesP = fetch(link.href)
    .then((res) => res.text())
    .then((text) => parseBundleGraph(text, base))
    .catch((e) => {
      console.error('Error loading bundle graph, retrying later', e);
      setTimeout(() => {
        bundlesP = undefined;
      }, 60000);
    });
};

const makePreloadLink = (bundle: BundleImport, priority: boolean) => {
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = bundle.$url$!;
  link.fetchPriority = priority ? 'high' : 'low';
  link.as = 'script';
  document.head.appendChild(link);
};

const prioritizeLink = (url: string) => {
  const link = document.querySelector(`link[href="${url}"]`) as HTMLLinkElement | null;
  if (link) {
    link.fetchPriority = 'high';
  } else {
    console.warn(`Preload link ${url} not found`);
  }
};

const preloadBundle = (bundle: BundleImport, priority: boolean) => {
  if (bundle.$state$ >= BundleImportState.Loading) {
    return;
  }
  if (bundle.$url$) {
    if (bundle.$state$ === BundleImportState.None) {
      makePreloadLink(bundle, priority);
    } else if (priority && bundle.$state$ === BundleImportState.Low) {
      prioritizeLink(bundle.$url$!);
    } else {
      return;
    }
  }
  bundle.$state$ = priority ? BundleImportState.Loading : BundleImportState.Low;
};

export const preload = (name: string, priority: boolean) => {
  if (!bundles) {
    wantedBundles.add({ name, priority });
    return;
  }
  const bundle = bundles.get(name);
  if (!bundle) {
    isDev && console.warn(`Bundle ${name} not found`);
    return;
  }
  const isReprioritize = priority && bundle.$state$ === BundleImportState.Low;
  if (bundle.$state$ !== BundleImportState.None && !isReprioritize) {
    // prevent loops
    return;
  }
  preloadBundle(bundle, priority);
  for (const importName of bundle.$imports$) {
    preload(importName, priority);
  }
  if (!isReprioritize) {
    for (const importName of bundle.$dynamicImports$) {
      preload(importName, false);
    }
  }
};
