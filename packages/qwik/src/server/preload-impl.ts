import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import type { ResolvedManifest } from '../optimizer/src/types';
import { expandBundles } from './preload-strategy';
import type { PreloaderOptions, RenderToStreamOptions, SnapshotResult } from './types';
import { initPreloader } from '../core/preloader/bundle-graph';
import { getPreloadPaths } from './preload-strategy';

export const preloaderPre = (
  base: string,
  resolvedManifest: ResolvedManifest | undefined,
  options: PreloaderOptions | false | undefined,
  beforeContent: JSXNode<string>[],
  nonce?: string
) => {
  const preloadChunk = resolvedManifest?.manifest?.preloader;
  if (preloadChunk && options !== false) {
    // Initialize the SSR preloader
    const preloaderOpts: Parameters<typeof initPreloader>[1] =
      typeof options === 'object'
        ? {
            debug: options.debug,
            preloadProbability: options.ssrPreloadProbability,
          }
        : undefined;
    initPreloader(resolvedManifest?.manifest.bundleGraph, preloaderOpts);

    // Add the preloader script to the head
    const opts: string[] = [];
    if (options?.debug) {
      opts.push('d:1');
    }
    if (options?.maxIdlePreloads) {
      opts.push(`P:${options.maxIdlePreloads}`);
    }
    if (options?.preloadProbability) {
      opts.push(`Q:${options.preloadProbability}`);
    }
    const optsStr = opts.length ? `,{${opts.join(',')}}` : '';

    const hash = resolvedManifest?.manifest.manifestHash;

    const script =
      `let b=fetch("${base}q-bundle-graph-${hash}.json");` +
      `import("${base}${preloadChunk}").then(({l})=>` +
      `l(${JSON.stringify(base)},b${optsStr})` +
      `);`;

    beforeContent.push(
      /**
       * We add modulepreloads even when the script is at the top because they already fire during
       * html download
       */
      jsx('link', { rel: 'modulepreload', href: `${base}${preloadChunk}` }),
      jsx('link', {
        rel: 'preload',
        href: `${base}q-bundle-graph-${resolvedManifest?.manifest.manifestHash}.json`,
        as: 'fetch',
        crossorigin: 'anonymous',
      }),
      jsx('script', {
        type: 'module',
        async: true,
        dangerouslySetInnerHTML: script,
        nonce,
      })
    );

    const core = resolvedManifest?.manifest.core;
    if (core) {
      beforeContent.push(jsx('link', { rel: 'modulepreload', href: `${base}${core}` }));
    }
  }
};

export const includePreloader = (
  base: string,
  resolvedManifest: ResolvedManifest | undefined,
  options: PreloaderOptions | boolean | undefined,
  referencedBundles: string[],
  nonce?: string
): JSXNode | null => {
  if (referencedBundles.length === 0 || options === false) {
    return null;
  }
  const { ssrPreloads, ssrPreloadProbability } = normalizePreLoaderOptions(
    typeof options === 'boolean' ? undefined : options
  );
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

  const manifestHash = resolvedManifest?.manifest.manifestHash;
  if (allowed) {
    const expandedBundles = expandBundles(referencedBundles, resolvedManifest);
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

  const preloadChunk = manifestHash && resolvedManifest?.manifest.preloader;
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
    // We are super careful not to interfere with the page loading.
    const script =
      insertLinks +
      // First we wait for the onload event
      `window.addEventListener('load',f=>{` +
      `f=_=>import("${base}${preloadChunk}").then(({p})=>p(${JSON.stringify(referencedBundles)}));` +
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
};

export const preloaderPost = (
  base: string,
  snapshotResult: SnapshotResult,
  opts: RenderToStreamOptions,
  resolvedManifest: ResolvedManifest | undefined,
  output: (JSXNode | null)[]
) => {
  if (opts.preloader !== false) {
    // skip prefetch implementation if prefetchStrategy === null
    const preloadBundles = getPreloadPaths(snapshotResult, opts, resolvedManifest);
    // If no preloadBundles, there is no reactivity, so no need to include the preloader
    if (preloadBundles.length > 0) {
      const result = includePreloader(
        base,
        resolvedManifest,
        opts.preloader,
        preloadBundles,
        opts.serverData?.nonce
      );
      if (result) {
        output.push(result);
      }
    }
  }
};

function normalizePreLoaderOptions(
  input: PreloaderOptions | undefined
): Required<PreloaderOptions> {
  return { ...PreLoaderOptionsDefault, ...input };
}

const PreLoaderOptionsDefault: Required<PreloaderOptions> = {
  ssrPreloads: 7,
  ssrPreloadProbability: 0.5,
  debug: false,
  maxIdlePreloads: 25,
  preloadProbability: 0.35,
};
