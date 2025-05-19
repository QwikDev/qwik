// keep this import from qwik/build so the cjs build works
import { isDev } from '@builder.io/qwik/build';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { _jsxC } from '../internal';
import type { JSXOutput } from '../render/jsx/types/jsx-node';

/**
 * @deprecated This is no longer needed as the preloading happens automatically in qrl-class.ts.
 *   Leave this in your app for a while so it uninstalls existing service workers, but don't use it
 *   for new projects.
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

  // if an MFE app has a custom BASE_URL then this will be the correct value
  // if you're not using MFE from another codebase then you want to override this value to your custom setup
  const baseUrl = import.meta.env.BASE_URL || '/';
  const resolvedOpts = {
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
  let code = PREFETCH_CODE.replace("'_URL_'", JSON.stringify(resolvedOpts.path));
  if (!isDev) {
    // consecutive spaces are indentation
    code = code.replaceAll(/\s\s+/gm, '');
  }
  const props = {
    dangerouslySetInnerHTML: [
      '(' + code + ')(',
      [
        'navigator.serviceWorker', // Service worker container
      ].join(','),
      ');',
    ].join(''),
    nonce: resolvedOpts.nonce,
  };
  return _jsxC('script', props, 0, 'prefetch-service-worker');
};

const PREFETCH_CODE = /*#__PURE__*/ ((
  c: ServiceWorkerContainer // Service worker container
) => {
  if ('getRegistrations' in c) {
    c.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        if (registration.active) {
          if (registration.active.scriptURL.endsWith('_URL_')) {
            registration.unregister().catch(console.error);
          }
        }
      });
    });
  }
}).toString();

/**
 * @deprecated This is no longer needed as the preloading happens automatically in qrl-class. You
 *   can remove this component from your app.
 * @alpha
 */
export const PrefetchGraph = (
  opts: { base?: string; manifestHash?: string; manifestURL?: string; nonce?: string } = {}
): JSXOutput => null;
