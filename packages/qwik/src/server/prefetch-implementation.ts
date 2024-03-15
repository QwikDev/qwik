import { Fragment, jsx, type JSXNode } from '@builder.io/qwik';
import {
  flattenPrefetchResources,
  getMostReferenced,
  prefetchUrlsEventScript,
  workerFetchScript,
} from './prefetch-utils';
import type { PrefetchImplementation, PrefetchResource, PrefetchStrategy } from './types';
import type { SsrAttrs, SSRContainer } from './qwik-types';

export function applyPrefetchImplementation(
  prefetchStrategy: PrefetchStrategy | undefined,
  prefetchResources: PrefetchResource[],
  nonce?: string
): JSXNode | null {
  // if prefetchStrategy is undefined, use defaults
  // set default if implementation wasn't provided
  const prefetchImpl = normalizePrefetchImplementation(prefetchStrategy?.implementation);

  const prefetchNodes: JSXNode[] = [];

  if (prefetchImpl.prefetchEvent === 'always') {
    prefetchUrlsEvent(prefetchNodes, prefetchResources, nonce);
  }

  if (prefetchImpl.linkInsert === 'html-append') {
    linkHtmlImplementation(prefetchNodes, prefetchResources, prefetchImpl);
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

export function applyPrefetchImplementation2(
  container: SSRContainer,
  prefetchStrategy: PrefetchStrategy | undefined,
  prefetchResources: PrefetchResource[],
  nonce?: string
): void {
  // if prefetchStrategy is undefined, use defaults
  // set default if implementation wasn't provided
  const prefetchImpl = normalizePrefetchImplementation(prefetchStrategy?.implementation);

  if (prefetchImpl.prefetchEvent === 'always') {
    prefetchUrlsEvent2(container, prefetchResources, nonce);
  }

  if (prefetchImpl.linkInsert === 'html-append') {
    linkHtmlImplementation2(container, prefetchResources, prefetchImpl);
  }

  if (prefetchImpl.linkInsert === 'js-append') {
    linkJsImplementation2(container, prefetchResources, prefetchImpl, nonce);
  } else if (prefetchImpl.workerFetchInsert === 'always') {
    workerFetchImplementation2(container, prefetchResources, nonce);
  }
}

function prefetchUrlsEvent(
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
        prefetchUrlsEventScript(prefetchResources) +
        `;document.dispatchEvent(new CustomEvent('qprefetch', {detail:{links: [location.pathname]}}))`,
      nonce,
    })
  );
}

function prefetchUrlsEvent2(
  container: SSRContainer,
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  const mostReferenced = getMostReferenced(prefetchResources);
  for (const url of mostReferenced) {
    const attrs = ['rel', 'modulepreload', 'href', url];
    if (nonce) {
      attrs.push('nonce', nonce);
    }
    container.openElement('link', attrs);
    container.closeElement();
  }
  const scriptAttrs = ['q:type', 'prefetch-bundles'];
  if (nonce) {
    scriptAttrs.push('nonce', nonce);
  }
  container.openElement('script', scriptAttrs);
  container.writer.write(prefetchUrlsEventScript(prefetchResources));
  container.writer.write(
    `;document.dispatchEvent(new CustomEvent('qprefetch', {detail:{links: [location.pathname]}}))`
  );

  container.closeElement();
}

/** Creates the `<link>` within the rendered html. Optionally add the JS worker fetch */
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

function linkHtmlImplementation2(
  container: SSRContainer,
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>
) {
  const urls = flattenPrefetchResources(prefetchResources);
  const rel = prefetchImpl.linkRel || 'prefetch';

  for (const url of urls) {
    const attributes: SsrAttrs = ['href', url, 'rel', rel];
    if (rel === 'prefetch' || rel === 'preload') {
      if (url.endsWith('.js')) {
        attributes.push('as', 'script');
      }
    }

    container.openElement('link', attributes);
    container.closeElement();
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
      'q:type': 'link-js',
      dangerouslySetInnerHTML: s,
      nonce,
    })
  );
}

function linkJsImplementation2(
  container: SSRContainer,
  prefetchResources: PrefetchResource[],
  prefetchImpl: Required<PrefetchImplementation>,
  nonce?: string
) {
  const scriptAttrs = ['type', 'module', 'q:type', 'link-js'];
  if (nonce) {
    scriptAttrs.push('nonce', nonce);
  }
  container.openElement('script', scriptAttrs);

  const rel = prefetchImpl.linkRel || 'prefetch';

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    container.writer.write(`let supportsLinkRel = true;`);
  }

  container.writer.write(`const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`);
  container.writer.write(`u.map((u,i)=>{`);

  container.writer.write(`const l=document.createElement('link');`);
  container.writer.write(`l.setAttribute("href",u);`);
  container.writer.write(`l.setAttribute("rel","${rel}");`);

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    container.writer.write(`if(i===0){`);
    container.writer.write(`try{`);
    container.writer.write(`supportsLinkRel=l.relList.supports("${rel}");`);
    container.writer.write(`}catch(e){}`);
    container.writer.write(`}`);
  }

  container.writer.write(`document.body.appendChild(l);`);

  container.writer.write(`});`);

  if (prefetchImpl.workerFetchInsert === 'no-link-support') {
    container.writer.write(`if(!supportsLinkRel){`);
    container.writer.write(workerFetchScript());
    container.writer.write(`}`);
  }

  if (prefetchImpl.workerFetchInsert === 'always') {
    container.writer.write(workerFetchScript());
  }
  container.closeElement();
}

function workerFetchImplementation(
  prefetchNodes: JSXNode[],
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  let s = `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`;
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

function workerFetchImplementation2(
  container: SSRContainer,
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  const scriptAttrs = ['type', 'module', 'q:type', 'prefetch-worker'];
  if (nonce) {
    scriptAttrs.push(nonce, 'nonce');
  }
  container.openElement('script', scriptAttrs);

  container.writer.write(`const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`);
  container.writer.write(workerFetchScript());

  container.closeElement();
}

function normalizePrefetchImplementation(
  input: PrefetchImplementation | undefined
): Required<PrefetchImplementation> {
  return { ...PrefetchImplementationDefault, ...input };
}

const PrefetchImplementationDefault: Required<PrefetchImplementation> = {
  linkInsert: null,
  linkRel: null,
  workerFetchInsert: null,
  prefetchEvent: 'always',
};
