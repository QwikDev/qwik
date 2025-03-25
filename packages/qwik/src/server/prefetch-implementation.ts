import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import {
  flattenPrefetchResources,
  getMostReferenced,
  prefetchUrlsEventScript,
  workerFetchScript,
} from './prefetch-utils';
import type { PrefetchImplementation, PrefetchResource, PrefetchStrategy } from './types';

export function applyPrefetchImplementation(
  base: string,
  manifestHash: string | undefined,
  prefetchStrategy: PrefetchStrategy | undefined,
  prefetchResources: PrefetchResource[],
  nonce?: string
): JSXNode | null {
  // if prefetchStrategy is undefined, use defaults
  // set default if implementation wasn't provided
  const prefetchImpl = normalizePrefetchImplementation(prefetchStrategy?.implementation);

  const prefetchNodes: JSXNode[] = [];

  if (prefetchImpl.prefetchEvent === 'always') {
    prefetchUrlsEvent(base, prefetchNodes, prefetchResources, nonce);
  }

  if (prefetchImpl.linkInsert === 'html-append') {
    linkHtmlImplementation(
      base,
      manifestHash,
      nonce,
      prefetchNodes,
      prefetchResources,
      prefetchImpl
    );
  }

  if (prefetchImpl.linkInsert === 'js-append') {
    linkJsImplementation(prefetchNodes, prefetchResources, prefetchImpl, nonce);
  } else if (prefetchImpl.workerFetchInsert === 'always') {
    workerFetchImplementation(prefetchNodes, prefetchResources, nonce);
  }

  if (prefetchNodes.length > 0) {
    return jsx(Fragment, { children: prefetchNodes });
  }

  return null;
}

function prefetchUrlsEvent(
  base: string,
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  const mostReferenced = getMostReferenced(prefetchResources);
  for (const url of mostReferenced) {
    prefetchNodes.push(
      jsx('link', {
        rel: 'modulepreload',
        href: url,
        nonce,
      })
    );
  }
  prefetchNodes.push(
    jsx('script', {
      'q:type': 'prefetch-bundles',
      dangerouslySetInnerHTML:
        prefetchUrlsEventScript(base, prefetchResources) +
        `document.dispatchEvent(new CustomEvent('qprefetch', {detail:{links: [location.pathname]}}))`,
      nonce,
    })
  );
}

/** Creates the `<link>` within the rendered html */
function linkHtmlImplementation(
  base: string,
  manifestHash: string | undefined,
  nonce: string | undefined,
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const urls = flattenPrefetchResources(prefetchResources);
  const rel = prefetchImpl.linkRel || 'modulepreload';

  if (manifestHash) {
    prefetchNodes.push(
      jsx('link', {
        rel: 'fetch',
        id: `qwik-bg-${manifestHash}`,
        href: `${base}q-bundle-graph-${manifestHash}.json`,
        as: 'fetch',
        crossorigin: 'anonymous',
        priority: prefetchImpl.linkFetchPriority || undefined,
      })
    );
  }
  for (const [url, priority] of urls) {
    const fetchpriority = priority
      ? prefetchImpl.linkFetchPriority || 'high'
      : prefetchImpl.linkFetchPriority === 'low'
        ? 'low'
        : undefined;
    prefetchNodes.push(
      jsx('link', {
        href: url,
        rel,
        fetchpriority,
        nonce,
        // TODO: add integrity
      })
    );
  }
}

/**
 * Uses JS to add the `<link>` elements at runtime, and if the link prefetching isn't supported,
 * it'll also add the web worker fetch.
 */
function linkJsImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>,
  nonce?: string
) {
  const rel = prefetchImpl.linkRel || 'modulepreload';
  const priority = prefetchImpl.linkFetchPriority;
  let s = ``;

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    s += `let supportsLinkRel = true;`;
  }

  s += `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources).keys())};`;
  s += `u.map((u,i)=>{`;

  s += `const l=document.createElement('link');`;
  s += `l.setAttribute("href",u);`;
  s += `l.setAttribute("rel","${rel}");`;
  if (priority) {
    s += `l.setAttribute("fetchpriority","${priority}");`;
  }

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
      'q:type': 'link-js',
      dangerouslySetInnerHTML: s,
      nonce,
    })
  );
}

function workerFetchImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  let s = `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources).keys())};`;
  s += workerFetchScript();

  prefetchNodes.push(
    jsx('script', {
      type: 'module',
      'q:type': 'prefetch-worker',
      dangerouslySetInnerHTML: s,
      nonce,
    })
  );
}

function normalizePrefetchImplementation(
  input: PrefetchImplementation | undefined
): Required<PrefetchImplementation> {
  return { ...PrefetchImplementationDefault, ...input };
}

const PrefetchImplementationDefault: Required<PrefetchImplementation> = {
  linkInsert: 'html-append',
  linkRel: 'modulepreload',
  linkFetchPriority: null,
  workerFetchInsert: null,
  prefetchEvent: null,
};
