import { Fragment, jsx, type JSXNode, type PropsOf } from '@qwik.dev/core';
import { expandBundles } from './prefetch-strategy';
import type { PrefetchImplementation, PrefetchStrategy } from './types';
import type { ResolvedManifest, SSRContainer } from './qwik-types';

export function includePreloader(
  container: SSRContainer,
  resolved: ResolvedManifest | undefined,
  prefetchStrategy: PrefetchStrategy | undefined,
  referencedBundles: string[],
  nonce?: string
): JSXNode | null {
  if (referencedBundles.length === 0) {
    return null;
  }
  const {
    maxPreloads,
    linkRel,
    linkFetchPriority,
    minProbability,
    debug,
    maxSimultaneousPreloads,
    minPreloadProbability,
  } = normalizePrefetchImplementation(prefetchStrategy?.implementation);
  let allowed = maxPreloads;

  const nodes: JSXNode[] = [];

  let base = container.$buildBase$!;
  if (import.meta.env.DEV) {
    // Vite dev server active
    // in dev, all bundles are absolute paths from the base url, not /build
    base = import.meta.env.BASE_URL;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
  }

  const makeLink = (base: string, href: string) => {
    const attrs = ['rel', linkRel, 'href', `${base}${href}`];
    if (linkRel !== 'modulepreload') {
      attrs.push('fetchPriority', linkFetchPriority!);
      attrs.push('as', 'script');
    }
    container.openElement('link', null, attrs);
    container.closeElement();
  };

  const manifestHash = resolved?.manifest.manifestHash;
  if (allowed) {
    const expandedBundles = expandBundles(referencedBundles, resolved);
    // Keep the same as in expandBundles (but *10)
    let probability = 8;
    const tenXMinProbability = minProbability * 10;
    for (const bundleOrProbability of expandedBundles) {
      if (typeof bundleOrProbability === 'string') {
        if (probability < tenXMinProbability) {
          break;
        }
        makeLink(base, bundleOrProbability);
        if (--allowed === 0) {
          break;
        }
      } else {
        probability = bundleOrProbability;
      }
    }
  }

  const preloadChunk = manifestHash && resolved?.manifest.preloader;
  if (preloadChunk) {
    const opts: string[] = [];
    if (debug) {
      opts.push('d:1');
    }
    if (maxSimultaneousPreloads) {
      opts.push(`P:${maxSimultaneousPreloads}`);
    }
    if (minPreloadProbability) {
      opts.push(`Q:${minPreloadProbability}`);
    }
    const optsStr = opts.length ? `,{${opts.join(',')}}` : '';
    const script = `let b=fetch("${base}q-bundle-graph-${manifestHash}.json");import("${base}${preloadChunk}").then(({l,p})=>{l(${JSON.stringify(base)},b${optsStr});p(${JSON.stringify(referencedBundles)});})`;
    /**
     * Uses the preloader chunk to add the `<link>` elements at runtime. This allows core to simply
     * import the preloader as well and have all the state there, plus it makes it easy to write a
     * complex implementation.
     *
     * Note that we don't preload the preloader or bundlegraph, they are requested after the SSR
     * preloads because they are not as important. Also the preloader includes the vitePreload
     * function and will in fact already be in that list.
     */
    nodes.push(
      jsx('script', {
        type: 'module',
        'q:type': 'link-js',
        dangerouslySetInnerHTML: script,
        nonce,
      })
    );
  }

  if (nodes.length > 0) {
    return jsx(Fragment, { children: nodes });
  }

  return null;
}

function normalizePrefetchImplementation(
  input: PrefetchImplementation | undefined
): Required<PrefetchImplementation> {
  return { ...PrefetchImplementationDefault, ...input };
}

const PrefetchImplementationDefault: Required<PrefetchImplementation> = {
  maxPreloads: import.meta.env.DEV ? 15 : 7,
  minProbability: 0.6,
  debug: false,
  maxSimultaneousPreloads: 5,
  minPreloadProbability: 0.25,
  linkRel: 'modulepreload',
  linkFetchPriority: undefined!,
  linkInsert: undefined!,
  workerFetchInsert: undefined!,
  prefetchEvent: undefined!,
};
