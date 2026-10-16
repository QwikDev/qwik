import { isDev } from '@qwik.dev/core/build';
import { isSyncQrl, qTest, qrlToString, type SerializationContext } from '@qwik.dev/core';
import { escapeHTML } from './qwik-copy';
import type { PreloaderOptions, ServerQwikManifest } from './types';

const DEFAULT_SSR_PRELOADS = 0;
// The dev server serves modules unbundled, so there is nothing to preload
const isDevServer = isDev && !qTest;

const resolveBundle = (base: string, path: string | null | undefined): string | null => {
  if (path == null) {
    return null;
  }
  const segments: string[] = [];
  const parts = `${base}${path}`.split('/');
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    if (segment === '..' && segments.length > 0) {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
};

const nonceAttr = (nonce: string | undefined) =>
  nonce === undefined ? '' : ` nonce="${escapeHTML(nonce)}"`;

const modulePreload = (href: string, nonce: string | undefined) =>
  `<link rel="modulepreload" href="${escapeHTML(href)}"${nonceAttr(nonce)}>`;

const afterPagePaint = (task: string) =>
  `window.addEventListener('load',f=>{` +
  `f=_=>${task};` +
  `requestAnimationFrame(_=>requestAnimationFrame(_=>{` +
  `typeof requestIdleCallback==='function'?` +
  `requestIdleCallback(f,{timeout:1000}):` +
  `requestAnimationFrame(_=>setTimeout(f))` +
  `}))` +
  `})`;

/** Fetches preloader assets early and starts speculation after page paint. */
export function createPreloaderHead(
  manifest: ServerQwikManifest | undefined,
  base: string,
  options: PreloaderOptions | false | undefined,
  nonce: string | undefined
): string {
  let html = '';
  const preloader = resolveBundle(base, manifest?.preloader);
  const bundleGraph = manifest?.bundleGraphAsset
    ? `${import.meta.env?.BASE_URL || '/'}${manifest.bundleGraphAsset}`
    : undefined;
  if (!isDevServer && preloader && bundleGraph && options !== false) {
    const idle = options?.maxIdlePreloads ? `,{P:${options.maxIdlePreloads}}` : '';
    html +=
      modulePreload(preloader, nonce) +
      `<link rel="preload" href="${escapeHTML(bundleGraph)}" as="fetch" crossorigin="anonymous">` +
      `<script type="module" async crossorigin="anonymous"${nonceAttr(nonce)}>` +
      afterPagePaint(
        `{let b=fetch(${JSON.stringify(bundleGraph)});` +
          `import(${JSON.stringify(preloader)}).then(({l})=>l(${JSON.stringify(base)},b${idle}))}`
      ) +
      `</script>`;
  }
  const core = options === false ? null : resolveBundle(base, manifest?.core);
  return core ? html + modulePreload(core, nonce) : html;
}

/** Preloads the bundles the page's listeners need once the document has loaded. */
export function createPreloaderTail(
  serializationCtx: SerializationContext,
  manifest: ServerQwikManifest | undefined,
  base: string,
  options: PreloaderOptions | false | undefined,
  nonce: string | undefined
): string {
  if (isDevServer || options === false) {
    return '';
  }
  const bundles = new Set<string>();
  for (const qrl of serializationCtx.$eventQrls$) {
    if (!isSyncQrl(qrl)) {
      bundles.add(qrlToString(serializationCtx, qrl as never, 'chunk'));
    }
  }
  if (bundles.size === 0) {
    return '';
  }
  const referenced = [...bundles];
  const eager = referenced
    .filter((bundle) => bundle !== manifest?.preloader && bundle !== manifest?.core)
    .slice(0, options?.ssrPreloads ?? DEFAULT_SSR_PRELOADS);
  let script = eager.length
    ? `${JSON.stringify(eager)}.map((l,e)=>{e=document.createElement('link');` +
      `e.rel='modulepreload';e.href=${JSON.stringify(base)}+l;document.head.appendChild(e)});`
    : '';
  const preloader = resolveBundle(base, manifest?.preloader);
  if (preloader) {
    script += afterPagePaint(
      `import(${JSON.stringify(preloader)}).then(({p})=>p(${JSON.stringify(referenced)}))`
    );
  }
  return script
    ? `<script type="module" async="true" q:type="preload"${nonceAttr(nonce)}>${script}</script>`
    : '';
}
