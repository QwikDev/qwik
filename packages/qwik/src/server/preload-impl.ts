import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import type { ResolvedManifest } from '../optimizer/src/types';
import { expandBundles } from './prefetch-strategy';
import type { PreloaderOptions } from './types';

export function includePreloader(
  base: string,
  manifest: ResolvedManifest | undefined,
  options: PreloaderOptions | boolean | undefined,
  referencedBundles: string[],
  nonce?: string
): JSXNode | null {
  if (referencedBundles.length === 0 || options === false) {
    return null;
  }
  const { ssrPreloads, ssrPreloadProbability, debug, maxIdlePreloads, preloadProbability } =
    normalizePreLoaderOptions(typeof options === 'boolean' ? undefined : options);
  let allowed = ssrPreloads;

  const nodes: JSXNode[] = [];

  if (import.meta.env.DEV) {
    // Vite dev server active
    // in dev, all bundles are absolute paths from the base url, not /build
    base = import.meta.env.BASE_URL;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
  }

  const links = [];

  const manifestHash = manifest?.manifest.manifestHash;
  if (allowed) {
    const expandedBundles = expandBundles(referencedBundles, manifest);
    // Keep the same as in getQueue (but *10)
    let probability = 4;
    const tenXMinProbability = ssrPreloadProbability * 10;
    for (const hrefOrProbability of expandedBundles) {
      if (typeof hrefOrProbability === 'string') {
        if (probability < tenXMinProbability) {
          break;
        }
        links.push(hrefOrProbability);
        if (--allowed === 0) {
          break;
        }
      } else {
        probability = hrefOrProbability;
      }
    }
  }

  const preloadChunk = manifestHash && manifest?.manifest.preloader;
  if (preloadChunk) {
    const insertLinks = links.length
      ? /**
         * We only use modulepreload links because they behave best. Older browsers can rely on the
         * preloader which does feature detection and which will be available soon after inserting these
         * links.
         */
        `${JSON.stringify(links)}.map((l,e)=>{` +
        `e=document.createElement('link');` +
        `e.rel='modulepreload';` +
        `e.href=${JSON.stringify(base)}+l;` +
        `document.head.appendChild(e)` +
        `});`
      : '';
    const opts: string[] = [];
    if (debug) {
      opts.push('d:1');
    }
    if (maxIdlePreloads) {
      opts.push(`P:${maxIdlePreloads}`);
    }
    if (preloadProbability) {
      opts.push(`Q:${preloadProbability}`);
    }
    const optsStr = opts.length ? `,{${opts.join(',')}}` : '';
    // We are super careful not to interfere with the page loading.
    const script =
      // First we wait for the onload event
      `let b=fetch("${base}q-bundle-graph-${manifestHash}.json");` +
      insertLinks +
      `window.addEventListener('load',f=>{` +
      `f=_=>{` +
      `import("${base}${preloadChunk}").then(({l,p})=>{` +
      `l(${JSON.stringify(base)},b${optsStr});` +
      `p(${JSON.stringify(referencedBundles)});` +
      `})};` +
      // then we ask for idle callback
      `try{requestIdleCallback(f,{timeout:2000})}` +
      // some browsers don't support requestIdleCallback
      `catch(e){setTimeout(f,200)}` +
      `})`;
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
        'q:type': 'preload',
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

function normalizePreLoaderOptions(
  input: PreloaderOptions | undefined
): Required<PreloaderOptions> {
  return { ...PreLoaderOptionsDefault, ...input };
}

const PreLoaderOptionsDefault: Required<PreloaderOptions> = {
  ssrPreloads: 5,
  ssrPreloadProbability: 0.7,
  debug: false,
  maxIdlePreloads: 25,
  preloadProbability: 0.35,
};
