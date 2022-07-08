import type {
  PrefetchImplementation,
  PrefetchResource,
  QwikDocument,
  RenderToStringOptions,
} from './types';

export function applyPrefetchImplementation(
  doc: QwikDocument,
  parentElm: Element,
  opts: RenderToStringOptions,
  prefetchResources: PrefetchResource[]
) {
  const prefetchStrategy = opts.prefetchStrategy;
  if (prefetchStrategy !== null) {
    const prefetchImpl = prefetchStrategy?.implementation || 'worker-fetch';

    if (
      prefetchImpl === 'link-prefetch-html' ||
      prefetchImpl === 'link-preload-html' ||
      prefetchImpl === 'link-modulepreload-html'
    ) {
      linkHtmlImplementation(doc, parentElm, prefetchResources, prefetchImpl);
    } else if (
      prefetchImpl === 'link-prefetch' ||
      prefetchImpl === 'link-preload' ||
      prefetchImpl === 'link-modulepreload'
    ) {
      linkJsImplementation(doc, parentElm, prefetchResources, prefetchImpl);
    } else if (prefetchImpl === 'worker-fetch') {
      workerFetchImplementation(doc, parentElm, prefetchResources);
    }
  }
}

function linkHtmlImplementation(
  doc: QwikDocument,
  parentElm: Element,
  prefetchResources: PrefetchResource[],
  prefetchImpl: PrefetchImplementation
) {
  const urls = flattenPrefetchResources(prefetchResources);

  for (const url of urls) {
    const linkElm = doc.createElement('link');
    linkElm.setAttribute('href', url);

    if (prefetchImpl === 'link-modulepreload-html') {
      linkElm.setAttribute('rel', 'modulepreload');
    } else if (prefetchImpl === 'link-preload-html') {
      linkElm.setAttribute('rel', 'preload');
      if (url.endsWith('.js')) {
        linkElm.setAttribute('as', 'script');
      }
    } else {
      linkElm.setAttribute('rel', 'prefetch');
      if (url.endsWith('.js')) {
        linkElm.setAttribute('as', 'script');
      }
    }

    parentElm.appendChild(linkElm);
  }
}

function linkJsImplementation(
  doc: QwikDocument,
  parentElm: Element,
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

  const script = doc.createElement('script');
  script.setAttribute('type', 'module');
  script.innerHTML = s;
  parentElm.appendChild(script);
}

function workerFetchScript() {
  const fetch = `Promise.all(e.data.map(u=>fetch(u,{priority:"low"}))).finally(()=>{setTimeout(postMessage({}),999)})`;

  const workerBody = `onmessage=(e)=>{${fetch}}`;

  const blob = `new Blob(['${workerBody}'],{type:"text/javascript"})`;

  const url = `URL.createObjectURL(${blob})`;

  let s = `const w=new Worker(${url});`;
  s += `w.postMessage(u.map(u=>new URL(u,origin)+''));`;
  s += `w.onmessage=()=>{w.terminate()};`;

  return s;
}

function workerFetchImplementation(
  doc: QwikDocument,
  parentElm: Element,
  prefetchResources: PrefetchResource[]
) {
  let s = `const u=${JSON.stringify(flattenPrefetchResources(prefetchResources))};`;
  s += workerFetchScript();

  const script = doc.createElement('script');
  script.setAttribute('type', 'module');
  script.innerHTML = s;
  parentElm.appendChild(script);
}

export function flattenPrefetchResources(prefetchResources: PrefetchResource[]) {
  const urls: string[] = [];

  const addPrefetchResource = (prefetchResources: PrefetchResource[]) => {
    if (Array.isArray(prefetchResources)) {
      for (const prefetchResource of prefetchResources) {
        if (!urls.includes(prefetchResource.url)) {
          urls.push(prefetchResource.url);
          addPrefetchResource(prefetchResource.imports);
        }
      }
    }
  };

  addPrefetchResource(prefetchResources);

  return urls;
}
