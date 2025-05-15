import { expandBundles } from './prefetch-strategy';
import type { SSRContainer, ResolvedManifest } from './qwik-types';
import type { PreloaderOptions } from './types';

export function includePreloader(
  container: SSRContainer,
  resolved: ResolvedManifest | undefined,
  options: PreloaderOptions | boolean | undefined,
  referencedBundles: string[],
  nonce?: string
) {
  if (referencedBundles.length === 0 || options === false) {
    return null;
  }
  const { ssrPreloads, ssrPreloadProbability, debug, maxIdlePreloads, preloadProbability } =
    normalizePreLoaderOptions(typeof options === 'boolean' ? undefined : options);
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

  const manifestHash = resolved?.manifest.manifestHash;
  if (allowed) {
    const expandedBundles = expandBundles(referencedBundles, resolved);
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

  const preloadChunk = manifestHash && resolved?.manifest.preloader;
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
        `document.body.appendChild(e)` +
        `});`
      : '';
    const opts: string[] = [];
    if (debug) {
      opts.push('d:1');
    }
    if (maxIdlePreloads !== preLoaderOptionsDefault.maxIdlePreloads) {
      opts.push(`P:${maxIdlePreloads}`);
    }
    if (preloadProbability !== preLoaderOptionsDefault.preloadProbability) {
      opts.push(`Q:${preloadProbability}`);
    }
    const optsStr = opts.length ? `,{${opts.join(',')}}` : '';
    // We are super careful not to interfere with the page loading.
    const script =
      // First we wait for the onload event
      `window.addEventListener('load',f=>{` +
      `f=b=>{${insertLinks}` +
      `b=fetch("${base}q-bundle-graph-${manifestHash}.json");` +
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
    const attrs = ['type', 'module', 'q:type', 'preload'];
    if (nonce) {
      attrs.push('nonce', nonce);
    }
    container.openElement('script', null, attrs);
    container.writer.write(script);
    container.closeElement();
  }
}

function normalizePreLoaderOptions(
  input: PreloaderOptions | undefined
): Required<PreloaderOptions> {
  return { ...preLoaderOptionsDefault, ...input };
}

const preLoaderOptionsDefault: Required<PreloaderOptions> = {
  ssrPreloads: 5,
  ssrPreloadProbability: 0.7,
  debug: false,
  maxIdlePreloads: 25,
  preloadProbability: 0.35,
};
