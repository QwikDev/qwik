import { Fragment, jsx, type JSXNode, type PropsOf } from '@builder.io/qwik';
import type { ResolvedManifest } from '../optimizer/src/types';
import { expandBundles } from './prefetch-strategy';
import type { PrefetchImplementation, PrefetchStrategy } from './types';

export function includePreloader(
  base: string,
  manifest: ResolvedManifest | undefined,
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

  if (import.meta.env.DEV) {
    // Vite dev server active
    // in dev, all bundles are absolute paths from the base url, not /build
    base = import.meta.env.BASE_URL;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
  }

  const makeLink = (base: string, href: string) => {
    const linkProps: PropsOf<'link'> = {
      rel: linkRel!,
      href: `${base}${href}`,
    };
    if (linkRel !== 'modulepreload') {
      linkProps['fetchPriority'] = linkFetchPriority!;
      linkProps['as'] = 'script';
    }
    return jsx('link', linkProps as any);
  };

  const preloadChunk = manifest?.manifest.preloader;
  const manifestHash = manifest?.manifest.manifestHash;
  if (allowed && preloadChunk) {
    allowed--;
    nodes.push(makeLink(base, preloadChunk!));
    if (allowed && manifestHash) {
      allowed--;
      nodes.push(makeLink(base, `q-bundle-graph-${manifestHash}.js`));
    }
  }
  if (allowed) {
    const expandedBundles = expandBundles(referencedBundles, manifest);
    // Keep the same as in expandBundles (but *10)
    let probability = 8;
    const tenXMinProbability = minProbability * 10;
    for (const bundleOrProbability of expandedBundles) {
      if (typeof bundleOrProbability === 'string') {
        if (probability < tenXMinProbability) {
          break;
        }
        nodes.push(makeLink(base, bundleOrProbability));
        if (--allowed === 0) {
          break;
        }
      } else {
        probability = bundleOrProbability;
      }
    }
  }
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
    /**
     * Uses the preloader chunk to add the `<link>` elements at runtime. This allows core to simply
     * import the preloader as well and have all the state there, plus it makes it easy to write a
     * complex implementation.
     */
    nodes.push(
      jsx('script', {
        type: 'module',
        'q:type': 'link-js',
        dangerouslySetInnerHTML: `import("${base}${preloadChunk}").then(({l,p})=>{l(${JSON.stringify(base)}${manifestHash ? `,${JSON.stringify(manifestHash)}` : ''}${optsStr});p(${JSON.stringify(referencedBundles)});})`,
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
  maxPreloads: import.meta.env.DEV ? 10 : 5,
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
