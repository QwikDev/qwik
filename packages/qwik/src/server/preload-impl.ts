import { expandBundles, getPreloadPaths } from './preload-strategy';
import { initPreloader } from './qwik-copy';
import type { QRLInternal, SSRContainer } from './qwik-types';
import type { PreloaderOptions, RenderOptions, RenderToStreamOptions } from './types';

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

const getBase = (container: SSRContainer) => {
  let base = container.$buildBase$!;
  if (import.meta.env.DEV && !import.meta.env.TEST) {
    // Vite dev server active
    // in dev, all bundles are absolute paths from the base url, not /build
    base = import.meta.env.BASE_URL;
  }
  return base;
};

export const preloaderPre = (
  container: SSRContainer,
  options: RenderToStreamOptions['preloader'],
  nonce?: string
) => {
  const { resolvedManifest } = container;
  const base = getBase(container);
  const preloaderBundle = simplifyPath(base, resolvedManifest?.manifest?.preloader);
  let bundleGraphPath = resolvedManifest?.manifest.bundleGraphAsset;
  if (bundleGraphPath) {
    bundleGraphPath = (import.meta.env.BASE_URL || '/') + bundleGraphPath;
  }
  if (preloaderBundle && bundleGraphPath && options !== false) {
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

    /**
     * We add modulepreloads even when the script is at the top because they already fire during
     * html download
     */
    const preloaderLinkAttrs = ['rel', 'modulepreload', 'href', preloaderBundle];
    if (nonce) {
      preloaderLinkAttrs.push('nonce', nonce);
    }
    container.openElement('link', null, preloaderLinkAttrs);
    container.closeElement();
    container.openElement('link', null, [
      'rel',
      'preload',
      'href',
      bundleGraphPath,
      'as',
      'fetch',
      'crossorigin',
      'anonymous',
    ]);
    container.closeElement();

    const script =
      `let b=fetch("${bundleGraphPath}");` +
      `import("${preloaderBundle}").then(({l})=>` +
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

  const corePath = simplifyPath(base, resolvedManifest?.manifest.core);
  if (corePath) {
    const linkAttrs = ['rel', 'modulepreload', 'href', corePath];
    if (nonce) {
      linkAttrs.push('nonce', nonce);
    }
    container.openElement('link', null, linkAttrs);
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

  const base = getBase(container);

  const links = [];

  const { resolvedManifest } = container;
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

  const preloaderBundle = simplifyPath(base, resolvedManifest?.manifest.preloader);
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
  if (preloaderBundle) {
    // First we wait for the onload event
    script +=
      `window.addEventListener('load',f=>{` +
      `f=_=>import("${preloaderBundle}").then(({p})=>p(${JSON.stringify(referencedBundles)}));` +
      // then we ask for idle callback
      `try{requestIdleCallback(f,{timeout:2000})}` +
      // some browsers don't support requestIdleCallback
      `catch(e){setTimeout(f,200)}` +
      `})`;
  }
  if (script) {
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
  preloadProbability: 0.35, // deprecated
};
