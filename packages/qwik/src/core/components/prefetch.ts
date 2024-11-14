import { isDev } from '@builder.io/qwik/build';
import { _jsxC } from '../internal';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { useServerData } from '../use/use-env-data';
import type { JSXOutput } from '../render/jsx/types/jsx-node';

/**
 * Install a service worker which will prefetch the bundles.
 *
 * There can only be one service worker per page. Because there can be many separate Qwik Containers
 * on the page each container needs to load its prefetch graph using `PrefetchGraph` component.
 *
 * @param opts - Options for the prefetch service worker.
 *
 *   - `base` - Base URL for the service worker `import.meta.env.BASE_URL` or `/`. Default is
 *       `import.meta.env.BASE_URL`
 *   - `scope` - Base URL for when the service-worker will activate. Default is `/`
 *   - `path` - Path to the service worker. Default is `qwik-prefetch-service-worker.js` unless you pass
 *       a path that starts with a `/` then the base is ignored. Default is
 *       `qwik-prefetch-service-worker.js`
 *   - `verbose` - Verbose logging for the service worker installation. Default is `false`
 *   - `nonce` - Optional nonce value for security purposes, defaults to `undefined`.
 *
 * @alpha
 */
export const PrefetchServiceWorker = (opts: {
  base?: string;
  scope?: string;
  path?: string;
  verbose?: boolean;
  fetchBundleGraph?: boolean;
  nonce?: string;
}): JSXNode<'script'> => {
  const isTest = import.meta.env.TEST;
  if (isDev && !isTest) {
    const props = {
      dangerouslySetInnerHTML: '<!-- PrefetchServiceWorker is disabled in dev mode. -->',
    };
    return _jsxC('script', props, 0, 'prefetch-service-worker');
  }

  const serverData = useServerData<Record<string, string>>('containerAttributes', {});
  // if an MFE app has a custom BASE_URL then this will be the correct value
  // if you're not using MFE from another codebase then you want to override this value to your custom setup
  const baseUrl = import.meta.env.BASE_URL || '/';
  const resolvedOpts = {
    base: serverData['q:base'],
    manifestHash: serverData['q:manifest-hash'],
    scope: '/',
    verbose: false,
    path: 'qwik-prefetch-service-worker.js',
    ...opts,
  };
  if (opts?.path?.startsWith?.('/')) {
    // allow different path and base
    resolvedOpts.path = opts.path;
  } else {
    // baseUrl: '/'
    // path: 'qwik-prefetch-service-worker.js'
    // the file 'qwik-prefetch-service-worker.js' is not located in /build/
    resolvedOpts.path = baseUrl + resolvedOpts.path;
  }
  let code = PREFETCH_CODE.replace('URL', resolvedOpts.path).replace('SCOPE', resolvedOpts.scope);
  if (!isDev) {
    code = code.replaceAll(/\s+/gm, '');
  }
  const props = {
    dangerouslySetInnerHTML: [
      '(' + code + ')(',
      [
        JSON.stringify(resolvedOpts.base),
        JSON.stringify(resolvedOpts.manifestHash),
        'navigator.serviceWorker',
        'window.qwikPrefetchSW||(window.qwikPrefetchSW=[])',
        resolvedOpts.verbose,
      ].join(','),
      ');',
    ].join(''),
    nonce: resolvedOpts.nonce,
  };
  return _jsxC('script', props, 0, 'prefetch-service-worker');
};

const PREFETCH_CODE = /*#__PURE__*/ ((
  b: string, // base
  h: string, // manifest hash
  c: ServiceWorkerContainer, // Service worker container
  q: Array<any[]>, // Queue of messages to send to the service worker.
  v: boolean // Verbose mode
) => {
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
  document.addEventListener(
    'qprefetch',
    (e: any) => e.detail.bundles && q.push(['prefetch', b, ...e.detail.bundles])
  );
}).toString();

/**
 * Load the prefetch graph for the container.
 *
 * Each Qwik container needs to include its own prefetch graph.
 *
 * @param opts - Options for the loading prefetch graph.
 *
 *   - `base` - Base of the graph. For a default installation this will default to the q:base value
 *       `/build/`. But if more than one MFE is installed on the page, then each MFE needs to have
 *       its own base.
 *   - `manifestHash` - Hash of the manifest file to load. If not provided the hash will be extracted
 *       from the container attribute `q:manifest-hash` and assume the default build file
 *       `${base}/q-bundle-graph-${manifestHash}.json`.
 *   - `manifestURL` - URL of the manifest file to load if non-standard bundle graph location name.
 *
 * @alpha
 */
export const PrefetchGraph = (
  opts: { base?: string; manifestHash?: string; manifestURL?: string; nonce?: string } = {}
): JSXOutput => {
  const isTest = import.meta.env.TEST;
  if (isDev && !isTest) {
    const props = {
      dangerouslySetInnerHTML: '<!-- PrefetchGraph is disabled in dev mode. -->',
    };
    return _jsxC('script', props, 0, 'prefetch-graph');
  }
  const serverData = useServerData<Record<string, string>>('containerAttributes', {});
  const resolvedOpts = {
    // /build/q-bundle-graph-${manifestHash}.json is always within the q:base location /build/
    base: serverData['q:base'],
    manifestHash: serverData['q:manifest-hash'],
    scope: '/',
    verbose: false,
    path: 'qwik-prefetch-service-worker.js',
    ...opts,
  };
  const args = JSON.stringify([
    'graph-url',
    resolvedOpts.base,
    `q-bundle-graph-${resolvedOpts.manifestHash}.json`,
  ]);
  const code = `(window.qwikPrefetchSW||(window.qwikPrefetchSW=[])).push(${args})`;
  const props = {
    dangerouslySetInnerHTML: code,
    nonce: opts.nonce,
  };
  return _jsxC('script', props, 0, 'prefetch-graph');
};
