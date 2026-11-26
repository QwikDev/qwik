import { getPlatform } from '@qwik.dev/core';
import { getPreloadOrder, initPreloader, qTest } from './qwik-copy';
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

// Built bundles live under the build base even when DEV is set, e.g. a NODE_ENV=development build.
// The Vite dev server has no built manifest, so it never preloads bundles from here.
const getBase = (container: SSRContainer) => container.$buildBase$!;

/** A JS literal for an inline script: `</script>` in a value would end the script element. */
const toScriptLiteral = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003C');

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
      if (options.maxIdlePreloads != null) {
        opts.push(`P:${options.maxIdlePreloads}`);
      }
    }
    const optsStr = opts.length ? `,{${opts.join(',')}}` : '';

    // Fetch early so the deferred start does not pay a request chain
    const preloaderLinkAttrs: Record<string, string> = {
      rel: 'modulepreload',
      href: preloaderBundle,
    };
    if (nonce) {
      preloaderLinkAttrs['nonce'] = nonce;
    }
    container.openElement('link', null, preloaderLinkAttrs, null, null, null);
    container.closeElement();
    container.openElement(
      'link',
      null,
      { rel: 'preload', href: bundleGraphPath, as: 'fetch', crossorigin: 'anonymous' },
      null,
      null,
      null
    );
    container.closeElement();

    const script = afterPagePaint(
      `{let b=fetch(${toScriptLiteral(bundleGraphPath)});` +
        `import(${toScriptLiteral(preloaderBundle)}).then(({l})=>` +
        `l(${toScriptLiteral(base)},b${optsStr})` +
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
};

const QRL_IMPORTS_MARKER = -1;

/** We only use modulepreload links because they behave best. */
const createLinksScript = (base: string, links: string[]) =>
  `${toScriptLiteral(links)}.map((l,e)=>{` +
  `e=document.createElement('link');` +
  `e.rel='modulepreload';` +
  `e.href=${toScriptLiteral(base)}+l;` +
  `document.head.appendChild(e)` +
  `});`;

/**
 * A bundle and everything it imports statically, imports first. After a bundle's name and its kind
 * marker, the graph lists its direct static imports up to the QRL imports marker, without those
 * reachable through another.
 */
const getStaticClosure = (bundleGraph: (string | number)[] | undefined, bundle: string) => {
  const closure: string[] = [];
  // Marked before visiting imports, since the graph keeps static import cycles
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    const nameIdx = bundleGraph?.indexOf(name) ?? -1;
    const hasKindMarker =
      nameIdx >= 0 && (bundleGraph![nameIdx + 1] as number) < QRL_IMPORTS_MARKER;
    for (
      let i = nameIdx + (hasKindMarker ? 2 : 1);
      nameIdx >= 0 && typeof bundleGraph![i] === 'number';
      i++
    ) {
      const depIdx = bundleGraph![i] as number;
      if (depIdx < 0) {
        break;
      }
      visit(bundleGraph![depIdx] as string);
    }
    closure.push(name);
  };
  visit(bundle);
  return closure;
};

const getNamedBundles = (bundleGraph: (string | number)[] | undefined, name: string) => {
  const bundles: string[] = [];
  const nameIdx = bundleGraph?.indexOf(name) ?? -1;
  for (let i = nameIdx + 1; nameIdx >= 0 && typeof bundleGraph![i] === 'number'; i++) {
    const depIdx = bundleGraph![i] as number;
    if (depIdx >= 0) {
      bundles.push(bundleGraph![depIdx] as string);
    }
  }
  return bundles;
};

const handlerBundlesLinked = new WeakMap<SSRContainer, string[]>();

/**
 * Links core and the bundles of core's handlers (`_run`, `_task`, …) that the page's events run
 * through, with their static imports, as each handler first appears instead of when the page has
 * finished streaming. Every interaction needs them, so `ssrPreloads` doesn't limit these links.
 * Libraries add to them with `_modulepreload`.
 */
export const preloadHandlerBundles = (
  container: SSRContainer,
  options: RenderToStreamOptions['preloader'],
  nonce?: string
): void => {
  if (options === false || (import.meta.env?.DEV && !qTest)) {
    return;
  }
  const manifest = container.resolvedManifest?.manifest;
  const qrls = Array.from(container.serializationCtx.$coreHandlerQrls$.values()) as QRLInternal[];
  const namedBundles: string[] = [];
  const askedFor = Array.from(container.serializationCtx.$modulepreloads$.values());
  for (let i = 0; i < askedFor.length; i++) {
    const item = askedFor[i];
    if (typeof item === 'string') {
      namedBundles.push(...getNamedBundles(manifest?.bundleGraph, item));
    } else {
      qrls.push(item as QRLInternal);
    }
  }
  const handlerBundles = [...getBundles(qrls), ...namedBundles];
  const linked = handlerBundlesLinked.get(container) ?? [];
  const links: string[] = [];
  for (let i = 0; i < handlerBundles.length; i++) {
    // Like the links at the end, skip names the bundle graph doesn't know: they may not be files
    if (!manifest?.bundleGraph?.includes(handlerBundles[i])) {
      continue;
    }
    const closure = getStaticClosure(manifest.bundleGraph, handlerBundles[i]);
    for (let j = 0; j < closure.length; j++) {
      const bundle = closure[j];
      if (bundle !== manifest.preloader && !linked.includes(bundle) && !links.includes(bundle)) {
        links.push(bundle);
      }
    }
  }
  if (!links.length) {
    return;
  }
  handlerBundlesLinked.set(container, [...linked, ...links]);
  const attrs: Record<string, string> = nonce ? { nonce } : {};
  // Inside the app's elements, so it must not stay in their DOM.
  container.writeScript(
    attrs,
    createLinksScript(getBase(container), links) + 'document.currentScript.remove()'
  );
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

  const base = getBase(container);

  const links: string[] = [];
  const linkedEarly = handlerBundlesLinked.get(container) ?? [];

  const { resolvedManifest } = container;
  if (ssrPreloads) {
    const preloaderBundle = resolvedManifest?.manifest.preloader;
    // With the bundle graph, link what the client preloader would fetch first for this hint.
    const ranked = getPreloadOrder(referencedBundles);
    const candidates = ranked.length ? ranked : referencedBundles;
    for (let i = 0; i < candidates.length && links.length < ssrPreloads; i++) {
      // we already preload the preloader bundle and the handler bundles linked mid-stream
      if (candidates[i] !== preloaderBundle && !linkedEarly.includes(candidates[i])) {
        links.push(candidates[i]);
      }
    }
  }
  const preloaderBundle = simplifyPath(base, resolvedManifest?.manifest.preloader);
  // Older browsers can rely on the preloader, which does feature detection.
  const insertLinks = links.length ? createLinksScript(base, links) : '';
  // We are super careful not to interfere with the page loading.
  let script = insertLinks;
  if (preloaderBundle) {
    script += afterPagePaint(
      `import(${toScriptLiteral(preloaderBundle)}).then(({p})=>p(${toScriptLiteral(referencedBundles)}))`
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
    preloadHandlerBundles(ssrContainer, opts.preloader, nonce);
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
  ssrPreloads: 0,
  maxIdlePreloads: 25,
};
