import { expandBundles, getPreloadPaths } from './preload-strategy';
import { initPreloader } from './qwik-copy';
import type { QRLInternal, SSRContainer } from './qwik-types';
import type { PreloaderOptions, RenderOptions, RenderToStreamOptions } from './types';

export const preloaderPre = (
  container: SSRContainer,
  options: RenderToStreamOptions['preloader'],
  nonce?: string
) => {
  const { resolvedManifest, $buildBase$: base } = container;
  const preloadChunk = resolvedManifest?.manifest?.preloader;
  if (!preloadChunk || options === false || base === null) {
    return;
  }

  const preloaderOpts: Parameters<typeof initPreloader>[1] =
    typeof options === 'object'
      ? {
          debug: options.debug,
          preloadProbability: options.ssrPreloadProbability,
        }
      : undefined;
  const bundleGraph = container.resolvedManifest?.manifest.bundleGraph;
  initPreloader(bundleGraph, preloaderOpts);

  // Add the preloader script to the head
  const opts: string[] = [];
  if (options) {
    if (options.debug) {
      opts.push('d:1');
    }
    if (options.maxIdlePreloads) {
      opts.push(`P:${options.maxIdlePreloads}`);
    }
    if (options.preloadProbability) {
      opts.push(`Q:${options.preloadProbability}`);
    }
  }
  const optsStr = opts.length ? `,{${opts.join(',')}}` : '';

  const hash = resolvedManifest?.manifest.manifestHash;

  if (hash) {
    /**
     * We add modulepreloads even when the script is at the top because they already fire during
     * html download
     */
    container.openElement('link', null, ['rel', 'modulepreload', 'href', `${base}${preloadChunk}`]);
    container.openElement('link', null, [
      'rel',
      'preload',
      'href',
      `${base}q-bundle-graph-${hash}.json`,
      'as',
      'fetch',
      'crossorigin',
      'anonymous',
    ]);

    const script =
      `let b=fetch("${base}q-bundle-graph-${hash}.json");` +
      `import("${base}${preloadChunk}").then(({l})=>` +
      `l(${JSON.stringify(base)},b${optsStr})` +
      `);`;
    const scriptAttrs = ['type', 'module', 'async', true];
    if (nonce) {
      scriptAttrs.push('nonce', nonce);
    }
    container.openElement('script', null, scriptAttrs);
    container.writer.write(script);
    container.closeElement();
  }

  const core = resolvedManifest?.manifest.core;
  if (core) {
    container.openElement('link', null, ['rel', 'modulepreload', 'href', `${base}${core}`]);
    container.closeElement();
  }
};

export const includePreloader = (
  container: SSRContainer,
  options: PreloaderOptions | boolean | undefined,
  referencedBundles: string[],
  nonce?: string
) => {
  if (referencedBundles.length === 0 || options === false) {
    return null;
  }
  const { ssrPreloads, ssrPreloadProbability } = normalizePreLoaderOptions(
    typeof options === 'boolean' ? undefined : options
  );
  let allowed = ssrPreloads;

  let base = container.$buildBase$!;
  if (import.meta.env.DEV) {
    // Vite dev server active
    // in dev, all bundles are absolute paths from the base url, not /build
    base = import.meta.env.BASE_URL;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
  }

  const links = [];

  const { resolvedManifest } = container;
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
     */
    const attrs = ['type', 'module', 'async', true, 'q:type', 'preload'];
    if (nonce) {
      attrs.push('nonce', nonce);
    }
    container.openElement('script', null, attrs);
    container.writer.write(script);
    container.closeElement();
  }

  return null;
};

export const preloaderPost = (ssrContainer: SSRContainer, opts: RenderOptions, nonce?: string) => {
  if (opts.preloader !== false) {
    const qrls = Array.from(ssrContainer.serializationCtx.$eventQrls$) as QRLInternal[];
    // skip prefetch implementation if prefetchStrategy === null
    const preloadBundles = getPreloadPaths(qrls, opts, ssrContainer.resolvedManifest);
    // If no preloadBundles, there is no reactivity, so no need to include the preloader
    if (preloadBundles.length > 0) {
      includePreloader(ssrContainer, opts.preloader, preloadBundles, nonce);
    }
  }
};

function normalizePreLoaderOptions(
  input: PreloaderOptions | undefined
): Required<PreloaderOptions> {
  return { ...preLoaderOptionsDefault, ...input };
}

const preLoaderOptionsDefault: Required<PreloaderOptions> = {
  ssrPreloads: 7,
  ssrPreloadProbability: 0.5,
  debug: false,
  maxIdlePreloads: 25,
  preloadProbability: 0.35,
};
