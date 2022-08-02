import { Fragment, jsx, JSXNode } from '@builder.io/qwik';
import { flattenPrefetchResources, workerFetchScript } from './prefetch-utils';
import type { PrefetchImplementation, PrefetchResource, RenderToStringOptions } from './types';

export function applyPrefetchImplementation(
  opts: RenderToStringOptions,
  prefetchResources: PrefetchResource[]
): JSXNode | null {
  const prefetchStrategy = opts.prefetchStrategy;
  if (prefetchStrategy !== null) {
    const prefetchImpl = prefetchStrategy?.implementation || 'worker-fetch';

    if (
      prefetchImpl === 'link-prefetch-html' ||
      prefetchImpl === 'link-preload-html' ||
      prefetchImpl === 'link-modulepreload-html'
    ) {
      return linkHtmlImplementation(prefetchResources, prefetchImpl);
    } else if (
      prefetchImpl === 'link-prefetch' ||
      prefetchImpl === 'link-preload' ||
      prefetchImpl === 'link-modulepreload'
    ) {
      return linkJsImplementation(prefetchResources, prefetchImpl);
    } else if (prefetchImpl === 'worker-fetch') {
      return workerFetchImplementation(prefetchResources);
    }
  }
  return null;
}

function linkHtmlImplementation(
  prefetchResources: PrefetchResource[],
  prefetchImpl: PrefetchImplementation
) {
  const urls = flattenPrefetchResources(prefetchResources);

  const links: JSXNode[] = [];
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

    links.push(jsx('link', attributes, undefined));
  }
  return jsx(Fragment, { children: links });
}

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
