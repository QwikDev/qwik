import {
  flattenPrefetchResources,
  getMostReferenced,
  prefetchUrlsEventScript,
  workerFetchScript,
} from './prefetch-utils';
import type { PrefetchImplementation, PrefetchResource, PrefetchStrategy } from './types';
import type { SsrAttrs, SSRContainer } from './qwik-types';

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
    container.openElement('link', null, attrs);
    container.closeElement();
  }
  const scriptAttrs = ['q:type', 'prefetch-bundles'];
  if (nonce) {
    scriptAttrs.push('nonce', nonce);
  }
  container.openElement('script', null, scriptAttrs);
  container.writer.write(prefetchUrlsEventScript(container.buildBase, prefetchResources));
  container.writer.write(
    `;document.dispatchEvent(new CustomEvent('qprefetch', {detail:{links: [location.pathname]}}))`
  );

  container.closeElement();
}

/** Creates the `<link>` within the rendered html. Optionally add the JS worker fetch */
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

    container.openElement('link', null, attributes);
    container.closeElement();
  }
}

/**
 * Uses JS to add the `<link>` elements at runtime, and if the link prefetching isn't supported,
 * it'll also add the web worker fetch.
 */
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
  container.openElement('script', null, scriptAttrs);

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

function workerFetchImplementation2(
  container: SSRContainer,
  prefetchResources: PrefetchResource[],
  nonce?: string
) {
  const scriptAttrs = ['type', 'module', 'q:type', 'prefetch-worker'];
  if (nonce) {
    scriptAttrs.push(nonce, 'nonce');
  }
  container.openElement('script', null, scriptAttrs);

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
