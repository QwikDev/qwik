import { Fragment, jsx, JSXNode } from '@builder.io/qwik';
import {
  flattenPrefetchResources,
  prefetchUrlsEventScript,
  workerFetchScript,
} from './prefetch-utils';
import type {
  DeprecatedPrefetchImplementation,
  PrefetchImplementation,
  PrefetchResource,
  PrefetchStrategy,
} from './types';

export function applyPrefetchImplementation(
  prefetchStrategy: PrefetchStrategy | undefined,
  prefetchResources: PrefetchResource[]
): JSXNode | null {
  // if prefetchStrategy is undefined, use defaults
  // set default if implementation wasn't provided
  const prefetchImpl = normalizePrefetchImplementation(prefetchStrategy?.implementation);

  const prefetchNodes: JSXNode[] = [];

  if (prefetchImpl.prefetchEvent === 'always') {
    prefetchUrlsEvent(prefetchNodes, prefetchResources);
  }

  if (prefetchImpl.linkInsert === 'html-append') {
    linkHtmlImplementation(prefetchNodes, prefetchResources, prefetchImpl);
  }

  if (prefetchImpl.linkInsert === 'js-append') {
    linkJsImplementation(prefetchNodes, prefetchResources, prefetchImpl);
  } else if (prefetchImpl.workerFetchInsert === 'always') {
    workerFetchImplementation(prefetchNodes, prefetchResources);
  }

  if (prefetchNodes.length > 0) {
    return jsx(Fragment, { children: prefetchNodes });
  }

  return null;
}

function prefetchUrlsEvent(prefetchNodes: JSXNode[], prefetchResources: PrefetchResource[]) {
  prefetchNodes.push(
    jsx('script', {
      type: 'module',
      dangerouslySetInnerHTML: prefetchUrlsEventScript(prefetchResources),
    })
  );
}

/**
 * Creates the `<link>` within the rendered html.
 * Optionally add the JS worker fetch
 */
function linkHtmlImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const urls = flattenPrefetchResources(prefetchResources);
  const rel = prefetchImpl.linkRel || 'prefetch';

  for (const url of urls) {
    const attributes: Record<string, string> = {};
    attributes['href'] = url;
    attributes['rel'] = rel;
    if (rel === 'prefetch' || rel === 'preload') {
      if (url.endsWith('.js')) {
        attributes['as'] = 'script';
      }
    }

    prefetchNodes.push(jsx('link', attributes, undefined));
  }
}

/**
 * Uses JS to add the `<link>` elements at runtime, and if the
 * link prefetching isn't supported, it'll also add the
 * web worker fetch.
 */
function linkJsImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const rel = prefetchImpl.linkRel || 'prefetch';
  let s = ``;

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    s += `let supportsLinkRel = true;`;
  }

  s += `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`;
  s += `u.map((u,i)=>{`;

  s += `const l=document.createElement('link');`;
  s += `l.setAttribute("href",u);`;
  s += `l.setAttribute("rel","${rel}");`;

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    s += `if(i===0){`;
    s += `try{`;
    s += `supportsLinkRel=l.relList.supports("${rel}");`;
    s += `}catch(e){}`;
    s += `}`;
  }

  s += `document.body.appendChild(l);`;

  s += `});`;

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    s += `if(!supportsLinkRel){`;
    s += workerFetchScript();
    s += `}`;
  }

  if (prefetchImpl.workerFetchInsert === 'always') {
    s += workerFetchScript();
  }

  prefetchNodes.push(
    jsx('script', {
      type: 'module',
      dangerouslySetInnerHTML: s,
    })
  );
}

function workerFetchImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[]
) {
  let s = `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`;
  s += workerFetchScript();

  prefetchNodes.push(
    jsx('script', {
      type: 'module',
      dangerouslySetInnerHTML: s,
    })
  );
}

function normalizePrefetchImplementation(
  input: PrefetchImplementation | DeprecatedPrefetchImplementation | undefined
): Required<PrefetchImplementation> {
  if (typeof input === 'string') {
    // deprecated
    switch (input) {
      case 'link-prefetch-html': {
        // Render link rel=prefetch within the html
        deprecatedWarning(input, 'linkInsert');
        return {
          linkInsert: 'html-append',
          linkRel: 'prefetch',
          workerFetchInsert: null,
          prefetchEvent: null,
        };
      }
      case 'link-prefetch': {
        // Use JS to add link rel=prefetch, add worker-fetch if not supported
        deprecatedWarning(input, 'linkInsert');
        return {
          linkInsert: 'js-append',
          linkRel: 'prefetch',
          workerFetchInsert: 'no-link-support',
          prefetchEvent: null,
        };
      }
      case 'link-preload-html': {
        // Render link rel=preload within the html
        deprecatedWarning(input, 'linkInsert');
        return {
          linkInsert: 'html-append',
          linkRel: 'preload',
          workerFetchInsert: null,
          prefetchEvent: null,
        };
      }
      case 'link-preload': {
        // Use JS to add link rel=preload, add worker-fetch if not supported
        deprecatedWarning(input, 'linkInsert');
        return {
          linkInsert: 'js-append',
          linkRel: 'preload',
          workerFetchInsert: 'no-link-support',
          prefetchEvent: null,
        };
      }
      case 'link-modulepreload-html': {
        // Render link rel=modulepreload within the html
        deprecatedWarning(input, 'linkInsert');
        return {
          linkInsert: 'html-append',
          linkRel: 'modulepreload',
          workerFetchInsert: null,
          prefetchEvent: null,
        };
      }
      case 'link-modulepreload': {
        // Use JS to add link rel=modulepreload, add worker-fetch if not supported
        deprecatedWarning(input, 'linkInsert');
        return {
          linkInsert: 'js-append',
          linkRel: 'modulepreload',
          workerFetchInsert: 'no-link-support',
          prefetchEvent: null,
        };
      }
    }
    // Add worker-fetch JS
    // default for deprecated string based option
    deprecatedWarning(input, 'workerFetchInsert');
    return {
      linkInsert: null,
      linkRel: null,
      workerFetchInsert: 'always',
      prefetchEvent: null,
    };
  }

  if (input && typeof input === 'object') {
    // user provided PrefetchImplementation
    return input as any;
  }

  // default PrefetchImplementation
  return PrefetchImplementationDefault;
}

const PrefetchImplementationDefault: Required<PrefetchImplementation> = {
  linkInsert: null,
  linkRel: null,
  workerFetchInsert: null,
  prefetchEvent: 'always',
};

function deprecatedWarning(oldApi: string, newApi: keyof PrefetchImplementation) {
  console.warn(
    `The Prefetch Strategy Implementation "${oldApi}" has been deprecated and will be removed in an upcoming release. Please update to use the "prefetchStrategy.implementation.${newApi}" interface.`
  );
}
