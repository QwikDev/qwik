import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import { flattenPrefetchResources, getMostReferenced, workerFetchScript } from './prefetch-utils';
import type { PrefetchImplementation, PrefetchResource, PrefetchStrategy } from './types';
import { makeMakePreloadLink } from '../core/qrl/preload';

export function applyPrefetchImplementation(
  base: string,
  manifestHash: string | undefined,
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
      manifestHash,
      nonce,
      prefetchNodes,
      prefetchResources,
      prefetchImpl
    );
  }

  if (prefetchImpl.linkInsert === 'js-append') {
    linkJsImplementation(base, manifestHash, nonce, prefetchNodes, prefetchResources, prefetchImpl);
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
        href: url,
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
        href: url,
        rel,
        fetchpriority,
        nonce,
        // TODO: add integrity
      })
    );
  }
}

/**
 * Uses JS to add the `<link>` elements at runtime, and if the link prefetching isn't supported,
 * it'll also add the web worker fetch.
 *
 * TODO use idle event
 */
function linkJsImplementation(
  base: string,
  manifestHash: string | undefined,
  nonce: string | undefined,
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const injector = makeMakePreloadLink.toString();
  const urls = flattenPrefetchResources(prefetchResources);
  const fetchPriority = prefetchImpl.linkFetchPriority;
  const forceLow = fetchPriority === 'low';
  const prio = [];
  const low = [];
  for (const [url, priority] of urls) {
    if (!priority || forceLow) {
      low.push(url);
    } else {
      prio.push(url);
    }
  }

  // Maybe this needs to be delayed
  const script = `
    var _=(${injector})(null);
    ${prio.length ? `${JSON.stringify(prio)}.forEach(u=>_(u,1));` : ''}
    ${low.length ? `${JSON.stringify(low)}.forEach(u=>_(u,0));` : ''}
  `.replaceAll(/^\s+|\s*\n/gm, '');

  prefetchNodes.push(
    jsx('script', {
      type: 'module',
      'q:type': 'link-js',
      dangerouslySetInnerHTML: script,
      nonce,
    }),
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
