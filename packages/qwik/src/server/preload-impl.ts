import { getPlatform, type JSXOutput } from '@qwik.dev/core';
import { _isJSXNode, _isQwikComponent, _SERIALIZABLE_STATE } from '@qwik.dev/core/internal';
import { getPreloadOrder, initPreloader, parseBundleGraph, qTest } from './qwik-copy';
import type { QRLInternal, SSRContainer } from './qwik-types';
import type {
  PreloaderOptions,
  RenderOptions,
  RenderToStreamOptions,
  ServerQwikManifest,
} from './types';

type BundleGraph = ReturnType<typeof parseBundleGraph>;

const parsedBundleGraphs = new WeakMap<
  object,
  { $graph$: BundleGraph; $preloadedBySeeds$: Map<string, Set<string>> }
>();

const bundlesPreloadedFrom = (graph: BundleGraph, seeds: string[]) => {
  const reached = new Set<string>();
  const pending = seeds.slice();
  while (pending.length) {
    const name = pending.pop()!;
    if (reached.has(name)) {
      continue;
    }
    reached.add(name);
    const deps = graph.get(name)?.$deps$;
    if (deps) {
      for (let i = 0; i < deps.length; i++) {
        pending.push(deps[i].$name$);
      }
    }
  }
  return reached;
};

const seedsWithUnreachedBundles = (
  manifest: ServerQwikManifest | undefined,
  seeds: string[],
  referencedBundles: string[]
) => {
  const serializedGraph = manifest?.bundleGraph;
  if (!serializedGraph || !seeds.length) {
    return referencedBundles;
  }
  let parsed = parsedBundleGraphs.get(serializedGraph);
  if (!parsed) {
    parsed = { $graph$: parseBundleGraph(serializedGraph), $preloadedBySeeds$: new Map() };
    parsedBundleGraphs.set(serializedGraph, parsed);
  }
  const graph = parsed.$graph$;
  const knownSeeds = seeds.filter((seed) => graph.has(seed));
  if (!knownSeeds.length) {
    return referencedBundles;
  }
  const seedsKey = knownSeeds.join(' ');
  let preloaded = parsed.$preloadedBySeeds$.get(seedsKey);
  if (!preloaded) {
    preloaded = bundlesPreloadedFrom(graph, knownSeeds);
    parsed.$preloadedBySeeds$.set(seedsKey, preloaded);
  }
  const hints = knownSeeds.slice();
  for (let i = 0; i < referencedBundles.length; i++) {
    const bundle = referencedBundles[i];
    const isPreloadedByHead = bundle === manifest.core || bundle === manifest.preloader;
    if (!preloaded.has(bundle) && !isPreloadedByHead) {
      hints.push(bundle);
    }
  }
  return hints;
};

const collectRootComponentQrls = (jsx: unknown, qrls: QRLInternal[]) => {
  if (Array.isArray(jsx)) {
    for (let i = 0; i < jsx.length; i++) {
      collectRootComponentQrls(jsx[i], qrls);
    }
  } else if (_isJSXNode(jsx)) {
    if (_isQwikComponent(jsx.type)) {
      qrls.push((jsx.type as any)[_SERIALIZABLE_STATE][0]);
    }
    collectRootComponentQrls(jsx.children, qrls);
  }
  return qrls;
};

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
  nonce?: string,
  seeds: string[] = []
) => {
  if (referencedBundles.length === 0 || options === false) {
    return null;
  }
  const { ssrPreloads } = normalizePreLoaderOptions(
    typeof options === 'boolean' ? undefined : options
  );

  const base = getBase(container);

  const links: string[] = [];

  const { resolvedManifest } = container;
  if (ssrPreloads) {
    const preloaderBundle = resolvedManifest?.manifest.preloader;
    const coreBundle = resolvedManifest?.manifest.core;
    // With the bundle graph, link what the client preloader would fetch first for this hint.
    const ranked = getPreloadOrder(referencedBundles);
    const candidates = ranked.length ? ranked : referencedBundles;
    for (let i = 0; i < candidates.length && links.length < ssrPreloads; i++) {
      // we already preload the preloader and core bundles
      if (candidates[i] !== preloaderBundle && candidates[i] !== coreBundle) {
        links.push(candidates[i]);
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
    const hints = seedsWithUnreachedBundles(resolvedManifest?.manifest, seeds, referencedBundles);
    script += afterPagePaint(
      `import("${preloaderBundle}").then(({p})=>p(${JSON.stringify(hints)}))`
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

export const preloaderPost = (
  ssrContainer: SSRContainer,
  opts: RenderOptions,
  nonce?: string,
  rootJsx?: JSXOutput
) => {
  if (import.meta.env?.DEV && !qTest) {
    return;
  }
  if (opts.preloader !== false) {
    const qrls = Array.from(ssrContainer.serializationCtx.$eventQrls$) as QRLInternal[];
    const preloadBundles = getBundles(qrls);
    const seeds = getBundles(collectRootComponentQrls(rootJsx, [])).concat(
      opts.serverData?.preloadSeeds || []
    );
    includePreloader(ssrContainer, opts.preloader, preloadBundles, nonce, seeds);
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
