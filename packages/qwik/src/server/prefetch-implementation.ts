import { Fragment, jsx, JSXNode } from '@builder.io/qwik';
import { flattenPrefetchResources, workerFetchScript } from './prefetch-utils';
import type {
  DeprecatedPrefetchImplementation,
  PrefetchImplementation,
  PrefetchResource,
  RenderToStringOptions,
} from './types';

export function applyPrefetchImplementation(
  opts: RenderToStringOptions,
  prefetchResources: PrefetchResource[]
): JSXNode | null {
  const { prefetchStrategy } = opts;

  // skip prefetch implementation if prefetchStrategy === null
  // if prefetchStrategy is undefined, use defaults
  if (prefetchStrategy !== null) {
    // set default if implementation wasn't provided
    const prefetchImpl = normalizePrefetchImplementation(prefetchStrategy?.implementation);

    if (prefetchImpl.linkInsert === 'html-append') {
      return linkHtmlImplementation(prefetchResources, prefetchImpl);
    } else if (prefetchImpl.linkInsert === 'js-append') {
      return linkJsImplementation(prefetchResources, prefetchImpl);
    } else if (prefetchImpl.workerFetchInsert === 'always') {
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
  prefetchImpl: Required<PrefetchImplementation>
) {
  const urls = flattenPrefetchResources(prefetchResources);
  const rel = prefetchImpl.linkRel || 'prefetch';

  const children: JSXNode[] = [];

  for (const url of urls) {
    const attributes: Record<string, string> = {};
    attributes['href'] = url;
    attributes['rel'] = rel;
    if (rel === 'prefetch' || rel === 'preload') {
      if (url.endsWith('.js')) {
        attributes['as'] = 'script';
      }
    }

    children.push(jsx('link', attributes, undefined));
  }

  if (prefetchImpl.workerFetchInsert === 'always') {
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

function normalizePrefetchImplementation(
  input: PrefetchImplementation | DeprecatedPrefetchImplementation | undefined
): Required<PrefetchImplementation> {
  if (typeof input === 'string') {
    // deprecated
    switch (input) {
      case 'link-prefetch-html': {
        // Render link rel=prefetch within the html
        return {
          linkInsert: 'html-append',
          linkRel: 'prefetch',
          workerFetchInsert: null,
        };
      }
      case 'link-prefetch': {
        // Use JS to add link rel=prefetch, add worker-fetch if not supported
        return {
          linkInsert: 'js-append',
          linkRel: 'prefetch',
          workerFetchInsert: 'no-link-support',
        };
      }
      case 'link-preload-html': {
        // Render link rel=preload within the html
        return {
          linkInsert: 'html-append',
          linkRel: 'preload',
          workerFetchInsert: null,
        };
      }
      case 'link-preload': {
        // Use JS to add link rel=preload, add worker-fetch if not supported
        return {
          linkInsert: 'js-append',
          linkRel: 'preload',
          workerFetchInsert: 'no-link-support',
        };
      }
      case 'link-modulepreload-html': {
        // Render link rel=modulepreload within the html
        return {
          linkInsert: 'html-append',
          linkRel: 'modulepreload',
          workerFetchInsert: null,
        };
      }
      case 'link-modulepreload': {
        // Use JS to add link rel=modulepreload, add worker-fetch if not supported
        return {
          linkInsert: 'js-append',
          linkRel: 'modulepreload',
          workerFetchInsert: 'no-link-support',
        };
      }
    }
    // Add worker-fetch JS
    // default for deprecated string based option
    return {
      linkInsert: null,
      linkRel: null,
      workerFetchInsert: 'always',
    };
  }

  if (input && typeof input === 'object') {
    // user provided PrefetchImplementation
    return input as any;
  }

  // default PrefetchImplementation
  const defaultImplementation: Required<PrefetchImplementation> = {
    linkInsert: 'html-append',
    linkRel: 'prefetch',
    workerFetchInsert: 'always',
  };
  return defaultImplementation;
}
