import { getPlatform } from '@qwik.dev/core';
import { initPreloader, qTest } from './qwik-copy';
import type { QRLInternal, SSRContainer } from './qwik-types';
import type { PreloaderOptions, RenderOptions, RenderToStreamOptions } from './types';

const simplifyPath = (base: string, path: string | null | undefined) => {
  if (path == null) {
    return null;
  }
  const segments = `${base}${path}`.split('/');
  const simplified = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
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
  if (import.meta.env?.DEV && !qTest) {
    // Vite dev server active
    // in dev, all bundles are absolute paths from the base url, not /build
    base = import.meta.env?.BASE_URL;
  }
  return base;
};

const afterPagePaint = (task: string) =>
  `window.addEventListener('load',f=>{` +
  `f=_=>${task};` +
  `requestAnimationFrame(_=>requestAnimationFrame(_=>{` +
  `typeof requestIdleCallback==='function'?` +
  `requestIdleCallback(f,{timeout:1000}):` +
  `requestAnimationFrame(_=>setTimeout(f))` +
  `}))` +
  `})`;

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
    bundleGraphPath = (import.meta.env?.BASE_URL || '/') + bundleGraphPath;
  }
  if (
    !(import.meta.env?.DEV && !qTest) &&
    preloaderBundle &&
    bundleGraphPath &&
    options !== false
  ) {
    const bundleGraph = container.resolvedManifest?.manifest.bundleGraph;
    initPreloader(bundleGraph);

    // Add the preloader script to the head
    const opts: string[] = [];
    if (options) {
      if (options.maxIdlePreloads) {
        opts.push(`P:${options.maxIdlePreloads}`);
      }
    }
    const optsStr = opts.length ? `,{${opts.join(',')}}` : '';

    const script = afterPagePaint(
      `{let b=fetch("${bundleGraphPath}");` +
        `import("${preloaderBundle}").then(({l})=>` +
        `l(${JSON.stringify(base)},b${optsStr})` +
        `)}`
    );
    const scriptAttrs: Record<string, string | boolean> = {
      type: 'module',
      async: true,
      crossorigin: 'anonymous',
    };
    if (nonce) {
      scriptAttrs['nonce'] = nonce;
    }
    container.writeScript(scriptAttrs, script);
  }

  const corePath = simplifyPath(base, resolvedManifest?.manifest.core);
  if (corePath) {
    const linkAttrs: Record<string, string> = { rel: 'modulepreload', href: corePath };
    if (nonce) {
      linkAttrs['nonce'] = nonce;
    }
    container.openElement('link', null, linkAttrs, null, null, null);
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
  const { ssrPreloads } = normalizePreLoaderOptions(
    typeof options === 'boolean' ? undefined : options
  );

  let allowedSsrPreloads = ssrPreloads;

  const base = getBase(container);

  const links = [];

  const { resolvedManifest } = container;
  if (allowedSsrPreloads) {
    const preloaderBundle = resolvedManifest?.manifest.preloader;
    const coreBundle = resolvedManifest?.manifest.core;
    for (let i = 0; i < referencedBundles.length; i++) {
      const href = referencedBundles[i];
      // we already preload the preloader and core bundles
      if (href === preloaderBundle || href === coreBundle) {
        continue;
      }
      links.push(href);
      if (--allowedSsrPreloads === 0) {
        break;
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
    script += afterPagePaint(
      `import("${preloaderBundle}").then(({p})=>p(${JSON.stringify(referencedBundles)}))`
    );
  }
  if (script) {
    /**
     * Uses the preloader chunk to add the `<link>` elements at runtime. This allows core to simply
     * import the preloader as well and have all the state there, plus it makes it easy to write a
     * complex implementation.
     */
    const attrs: Record<string, string> = { type: 'module', async: 'true', 'q:type': 'preload' };
    if (nonce) {
      attrs['nonce'] = nonce;
    }
    container.writeScript(attrs, script);
  }

  return null;
};

export const preloaderPost = (ssrContainer: SSRContainer, opts: RenderOptions, nonce?: string) => {
  if (import.meta.env?.DEV && !qTest) {
    return;
  }
  if (opts.preloader !== false) {
    const qrls = Array.from(ssrContainer.serializationCtx.$eventQrls$) as QRLInternal[];
    const preloadBundles = getBundles(qrls);
    includePreloader(ssrContainer, opts.preloader, preloadBundles, nonce);
  }
};

function normalizePreLoaderOptions(
  input: PreloaderOptions | undefined
): Required<PreloaderOptions> {
  return { ...preLoaderOptionsDefault, ...input };
}

export const getBundles = (qrls: QRLInternal[]) => {
  const platform = getPlatform();
  const bundles = (qrls as QRLInternal[])
    ?.map((qrl) => {
      const symbol = qrl.$symbol$;
      const chunk = qrl.$chunk$;
      const result = platform.chunkForSymbol(symbol, chunk, qrl.dev?.file);
      if (result) {
        return result[1];
      }
      return chunk;
    })
    .filter(Boolean) as string[];
  return [...new Set(bundles)];
};

const preLoaderOptionsDefault: Required<PreloaderOptions> = {
  ssrPreloads: 5,
  maxIdlePreloads: 25,
};
