import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import { flattenPrefetchResources, getMostReferenced, workerFetchScript } from './prefetch-utils';
import type {
  PrefetchImplementation,
  PrefetchResource,
  PrefetchStrategy,
  QwikManifest,
} from './types';

export function applyPrefetchImplementation(
  base: string,
  manifest: QwikManifest | undefined,
  prefetchStrategy: PrefetchStrategy | undefined,
  prefetchResources: PrefetchResource[],
  nonce?: string
): JSXNode | null {
  // if prefetchStrategy is undefined, use defaults
  // set default if implementation wasn't provided
  const prefetchImpl = normalizePrefetchImplementation(prefetchStrategy?.implementation);

  const prefetchNodes: JSXNode[] = [];

  if (prefetchImpl.prefetchEvent === 'always') {
    prefetchUrlsEvent(base, prefetchNodes, prefetchResources, nonce);
  }

  if (prefetchImpl.linkInsert === 'html-append') {
    linkHtmlImplementation(
      base,
      manifest?.manifestHash,
      nonce,
      prefetchNodes,
      prefetchResources,
      prefetchImpl
    );
  }

  if (prefetchImpl.linkInsert === 'js-append') {
    linkJsImplementation(base, manifest, nonce, prefetchNodes, prefetchResources, prefetchImpl);
  } else if (prefetchImpl.workerFetchInsert === 'always') {
    workerFetchImplementation(prefetchNodes, prefetchResources, nonce);
  }

  if (prefetchNodes.length > 0) {
    return jsx(Fragment, { children: prefetchNodes });
  }

  return null;
}

function prefetchUrlsEvent(
  base: string,
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  const mostReferenced = getMostReferenced(prefetchResources);
  for (const url of mostReferenced) {
    prefetchNodes.push(
      jsx('link', {
        rel: 'modulepreload',
        href: base + url,
        nonce,
      })
    );
  }
  // TODO: convert links to bundles
  // prefetchNodes.push(
  //   jsx('script', {
  //     'q:type': 'prefetch-bundles',
  //     dangerouslySetInnerHTML:
  //     prefetchUrlsEventScript(base, prefetchResources),
  //     nonce,
  //   })
  // );
}

/** Creates the `<link>` within the rendered html */
function linkHtmlImplementation(
  base: string,
  manifestHash: string | undefined,
  nonce: string | undefined,
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const urls = flattenPrefetchResources(prefetchResources);
  const rel = prefetchImpl.linkRel || 'modulepreload';

  if (manifestHash) {
    prefetchNodes.push(
      jsx('link', {
        rel: 'fetch',
        id: `qwik-bg-${manifestHash}`,
        href: `${base}q-bundle-graph-${manifestHash}.json`,
        as: 'fetch',
        crossorigin: 'anonymous',
        fetchpriority: prefetchImpl.linkFetchPriority || undefined,
      })
    );
  }
  for (const [url, priority] of urls) {
    const fetchpriority = priority
      ? prefetchImpl.linkFetchPriority || 'high'
      : prefetchImpl.linkFetchPriority === 'low'
        ? 'low'
        : undefined;
    prefetchNodes.push(
      jsx('link', {
        href: base + url,
        rel,
        fetchpriority,
        nonce,
        // TODO: add integrity
      })
    );
  }
}

/**
 * Uses the preloader chunk to add the `<link>` elements at runtime. This allows core to simply
 * import the preloader as well and have all the state there, plus it makes it easy to write a
 * complex implementation.
 */
function linkJsImplementation(
  base: string,
  manifest: QwikManifest | undefined,
  nonce: string | undefined,
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const preloadChunk = manifest?.preloader;
  if (!preloadChunk) {
    return linkHtmlImplementation(
      base,
      manifest?.manifestHash,
      nonce,
      prefetchNodes,
      prefetchResources,
      prefetchImpl
    );
  }
  const manifestHash = manifest.manifestHash;
  const urlMap = flattenPrefetchResources(prefetchResources);

  // TODO modulepreload the preloader before ssr, optional because we can't predict if we need it

  // TODO order imports by size/number of dependents?
  if (urlMap.size) {
    const urls = [...urlMap.keys()];

    // Already fetch the first 7 urls while we wait for the preloader to load
    for (const url of urls.slice(0, 7)) {
      prefetchNodes.push(
        jsx('link', {
          href: base + url,
          // not modulepreload, we don't want to fetch dependencies yet
          rel: 'preload',
          as: 'script',
          fetchpriority: 'low',
        })
      );
    }

    // preload the bundle graph at low priority
    // TODO make this a .js file so we can modulepreload it
    prefetchNodes.push(
      jsx('link', {
        rel: 'fetch',
        id: `qwik-bg-${manifestHash}`,
        href: `${base}q-bundle-graph-${manifestHash}.json`,
        as: 'fetch',
        crossorigin: 'anonymous',
        fetchpriority: 'low',
      })
    );

    // We request all the urls as low priority, so that newly needed resources are loaded first
    // We use a Promise so the script doesn't block the initial page load
    const script =
      `const d=Date.now();console.log('preloader loading',d);` +
      `import("${base}${preloadChunk}").then(({l,p})=>{` +
      (`console.log('preloader start',Date.now()-d);` +
        `l(${JSON.stringify(base)},${JSON.stringify(manifestHash)});` +
        `p(${JSON.stringify([...urlMap.keys()])});`) +
      `})`;

    prefetchNodes.push(
      jsx('script', {
        type: 'module',
        'q:type': 'link-js',
        dangerouslySetInnerHTML: script,
        nonce,
      })
    );
  }
}

function workerFetchImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  let s = `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources).keys())};`;
  s += workerFetchScript();

  prefetchNodes.push(
    jsx('script', {
      type: 'module',
      'q:type': 'prefetch-worker',
      dangerouslySetInnerHTML: s,
      nonce,
    })
  );
}

function normalizePrefetchImplementation(
  input: PrefetchImplementation | undefined
): Required<PrefetchImplementation> {
  return { ...PrefetchImplementationDefault, ...input };
}

const PrefetchImplementationDefault: Required<PrefetchImplementation> = {
  linkInsert: 'js-append',
  linkRel: 'modulepreload',
  linkFetchPriority: null,
  workerFetchInsert: null,
  prefetchEvent: null,
};
