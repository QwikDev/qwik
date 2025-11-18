import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import type { ResolvedManifest } from '../optimizer/src/types';
import { expandBundles } from './preload-strategy';
import type { PreloaderOptions, RenderToStreamOptions, SnapshotResult } from './types';
import { initPreloader } from '../core/preloader/bundle-graph';
import { getPreloadPaths } from './preload-strategy';

const simplifyPath = (base: string, path: string | null | undefined) => {
  if (path == null) {
    return null;
  }
  const segments = `${base}${path}`.split('/');
  const simplified = [];
  for (const segment of segments) {
    if (segment === '..' && simplified.length > 0) {
      simplified.pop();
    } else {
      simplified.push(segment);
    }
  }
  return simplified.join('/');
};

export const preloaderPre = (
  base: string,
  resolvedManifest: ResolvedManifest | undefined,
  options: PreloaderOptions | false | undefined,
  beforeContent: JSXNode<string>[],
  nonce?: string
) => {
  const preloaderPath = simplifyPath(base, resolvedManifest?.manifest?.preloader);
  const bundleGraphPath =
    (import.meta.env.BASE_URL || '/') + resolvedManifest?.manifest.bundleGraphAsset;
  if (preloaderPath && bundleGraphPath && options !== false) {
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

    const script =
      `let b=fetch("${bundleGraphPath}");` +
      `import("${preloaderPath}").then(({l})=>` +
      `l(${JSON.stringify(base)},b${optsStr})` +
      `);`;

    beforeContent.push(
      /**
       * We add modulepreloads even when the script is at the top because they already fire during
       * html download
       */
      jsx('link', { rel: 'modulepreload', href: preloaderPath, nonce, crossorigin: 'anonymous' }),
      jsx('link', {
        rel: 'preload',
        href: bundleGraphPath,
        as: 'fetch',
        crossorigin: 'anonymous',
        nonce,
      }),
      jsx('script', {
        type: 'module',
        async: true,
        dangerouslySetInnerHTML: script,
        nonce,
      })
    );
  }

  const corePath = simplifyPath(base, resolvedManifest?.manifest.core);
  if (corePath) {
    beforeContent.push(jsx('link', { rel: 'modulepreload', href: corePath, nonce }));
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
    const preloaderBundle = resolvedManifest?.manifest.preloader;
    const coreBundle = resolvedManifest?.manifest.core;
    const expandedBundles = expandBundles(referencedBundles, resolvedManifest);
    // Keep the same as in getQueue (but *10)
    let probability = 4;
    const tenXMinProbability = ssrPreloadProbability * 10;
    for (const hrefOrProbability of expandedBundles) {
      if (typeof hrefOrProbability === 'string') {
        if (probability < tenXMinProbability) {
          break;
        }
        // we already preload the preloader and core bundles
        if (hrefOrProbability === preloaderBundle || hrefOrProbability === coreBundle) {
          continue;
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

  const preloaderPath = simplifyPath(base, manifestHash && resolvedManifest?.manifest.preloader);
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
  let script = insertLinks;
  if (preloaderPath) {
    // First we wait for the onload event
    script +=
      `window.addEventListener('load',f=>{` +
      `f=_=>import("${preloaderPath}").then(({p})=>p(${JSON.stringify(referencedBundles)}));` +
      // then we ask for idle callback
      `try{requestIdleCallback(f,{timeout:2000})}` +
      // some browsers don't support requestIdleCallback
      `catch(e){setTimeout(f,200)}` +
      `})`;
  }
  /**
   * Uses the preloader chunk to add the `<link>` elements at runtime. This allows core to simply
   * import the preloader as well and have all the state there, plus it makes it easy to write a
   * complex implementation.
   *
   * Note that we don't preload the preloader or bundlegraph, they are requested after the SSR
   * preloads because they are not as important. Also the preloader includes the vitePreload
   * function and will in fact already be in that list.
   */
  if (script) {
    nodes.push(
      jsx('script', {
        type: 'module',
        'q:type': 'preload',
        /**
         * This async allows the preloader to be executed before the DOM is fully parsed even though
         * it's at the bottom of the body
         */
        async: true,
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
  preloadProbability: 0.35, // deprecated
};
