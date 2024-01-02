import { _jsxC } from '../internal';

/**
 * @param opts - Options for the prefetch service worker.
 *
 *   - `base` Base URL for the service worker.
 *   - `path` Path to the service worker.
 *
 * @returns
 * @alpha
 */
export const PrefetchServiceWorker = (opts: {
  base?: string;
  path?: string;
  verbose?: boolean;
  fetchBundleGraph?: boolean;
}) => {
  const resolvedOpts = {
    base: '/',
    verbose: false,
    fetchBundleGraph: true,
    path: 'qwik-prefetch-service-worker.js',
    ...opts,
  };
  let code = CODE.replace('URL', resolvedOpts.base + resolvedOpts.path).replace(
    'SCOPE',
    resolvedOpts.base
  );
  if (!resolvedOpts.verbose) {
    code = code.replaceAll(/\s+/gm, '');
  }
  const props = {
    dangerouslySetInnerHTML: [
      '(' + code + ')(',
      [
        "document.currentScript.closest('[q\\\\:container]')",
        'navigator.serviceWorker',
        'window.qwikPrefetchSW||(window.qwikPrefetchSW=[])',
        resolvedOpts.verbose,
        resolvedOpts.fetchBundleGraph,
      ].join(','),
      ');',
    ].join(''),
  };
  return _jsxC('script', props, 0, 'prefetch-service-worker');
};

const CODE = /*#__PURE__*/ ((
  qc: HTMLElement,
  c: ServiceWorkerContainer,
  q: Array<any[]>,
  v: boolean,
  f: boolean,
  b?: string,
  h?: string
) => {
  b = qc.getAttribute('q:base')!;
  h = qc.getAttribute('q:manifest-hash')!;
  c.register('URL', { scope: 'SCOPE' }).then(
    (sw: ServiceWorkerRegistration, onReady?: () => void) => {
      onReady = () => q.forEach((q.push = (v) => sw.active!.postMessage(v) as any));
      sw.installing
        ? sw.installing.addEventListener(
            'statechange',
            (e: any) => e.target.state == 'activated' && onReady!()
          )
        : onReady();
    }
  );
  v && q.push(['verbose']);
  f &&
    document.addEventListener(
      'qprefetch',
      (e: any) => e.detail.bundles && q.push(['prefetch', b, ...e.detail.bundles])
    );
  q.push(['graph-url', b, `q-bundle-graph-${h}.json`]);
}).toString();
