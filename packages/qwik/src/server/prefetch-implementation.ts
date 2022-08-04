import { Fragment, jsx, JSXNode } from '@builder.io/qwik';
import { flattenPrefetchResources, workerFetchScript } from './prefetch-utils';
import type { PrefetchImplementation, PrefetchResource, RenderToStringOptions } from './types';

const DEFAULT_PREFETCH_IMPLEMENTATION: PrefetchImplementation = 'link-prefetch-html-worker';

export function applyPrefetchImplementation(
  opts: RenderToStringOptions,
  prefetchResources: PrefetchResource[]
): JSXNode | null {
  const { prefetchStrategy } = opts;

  // skip prefetch implementation if prefetchStrategy === null
  // if prefetchStrategy is undefined, use defaults
  if (prefetchStrategy !== null) {
    // set default if implementation wasn't provided
    const prefetchImpl = prefetchStrategy?.implementation || DEFAULT_PREFETCH_IMPLEMENTATION;

    if (
      prefetchImpl === 'link-prefetch-html' ||
      prefetchImpl === 'link-preload-html' ||
      prefetchImpl === 'link-modulepreload-html'
    ) {
      // HTML <link> only
      // No JS worker runtime
      return linkHtmlImplementation(prefetchResources, prefetchImpl, false);
    }

    if (
      prefetchImpl === 'link-prefetch-html-worker' ||
      prefetchImpl === 'link-preload-html-worker' ||
      prefetchImpl === 'link-modulepreload-html-worker'
    ) {
      // HTML <link>
      // JS worker fetch
      return linkHtmlImplementation(prefetchResources, prefetchImpl, true);
    }

    if (
      prefetchImpl === 'link-prefetch' ||
      prefetchImpl === 'link-preload' ||
      prefetchImpl === 'link-modulepreload'
    ) {
      // JS runtime added <link>
      // Only add JS worker fetch if <link> isn't supported
      return linkJsImplementation(prefetchResources, prefetchImpl);
    }

    if (prefetchImpl === 'worker-fetch') {
      // JS runtime worker fetch only
      // No <link>
      return workerFetchImplementation(prefetchResources);
    }
  }

  // do not add a prefech implementation
  return null;
}

/**
 * Creates the `<link>` within the rendered html.
 * Optionally add the JS worker fetch
 */
function linkHtmlImplementation(
  prefetchResources: PrefetchResource[],
  prefetchImpl: PrefetchImplementation,
  includeWorkerFetch: boolean
) {
  const urls = flattenPrefetchResources(prefetchResources);

  const children: JSXNode[] = [];

  for (const url of urls) {
    const attributes: Record<string, string> = {};
    attributes['href'] = url;
    if (prefetchImpl === 'link-modulepreload-html') {
      attributes['rel'] = 'modulepreload';
    } else if (prefetchImpl === 'link-preload-html') {
      attributes['rel'] = 'preload';
      if (url.endsWith('.js')) {
        attributes['as'] = 'script';
      }
    } else {
      attributes['rel'] = 'prefetch';
      if (url.endsWith('.js')) {
        attributes['as'] = 'script';
      }
    }

    children.push(jsx('link', attributes, undefined));
  }

  if (includeWorkerFetch) {
    children.push(workerFetchImplementation(prefetchResources));
  }

  return jsx(Fragment, { children: children });
}

/**
 * Uses JS to add the `<link>` elements at runtime, and if the
 * link prefetching isn't supported, it'll also add the
 * web worker fetch.
 */
function linkJsImplementation(
  prefetchResources: PrefetchResource[],
  prefetchImpl: PrefetchImplementation
) {
  const rel =
    prefetchImpl === 'link-modulepreload'
      ? 'modulepreload'
      : prefetchImpl === 'link-preload'
      ? 'preload'
      : 'prefetch';

  let s = `let supportsLinkRel = true;`;

  s += `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`;
  s += `u.map((u,i)=>{`;

  s += `const l=document.createElement('link');`;
  s += `l.setAttribute("href",u);`;
  s += `l.setAttribute("rel","${rel}");`;

  if (rel === 'prefetch' || rel === 'preload') {
    s += `l.setAttribute("as","script");`;
  }

  s += `if(i===0){`;
  s += `try{`;
  s += `supportsLinkRel=l.relList.supports("${rel}");`;
  s += `}catch(e){}`;
  s += `}`;

  s += `document.body.appendChild(l);`;

  s += `});`;

  s += `if(!supportsLinkRel){`;
  s += workerFetchScript();
  s += `}`;

  return jsx('script', {
    type: 'module',
    dangerouslySetInnerHTML: s,
  });
}

function workerFetchImplementation(prefetchResources: PrefetchResource[]) {
  let s = `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`;
  s += workerFetchScript();

  return jsx('script', {
    type: 'module',
    dangerouslySetInnerHTML: s,
  });
}
