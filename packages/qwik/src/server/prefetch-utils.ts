import type { QPrefetchData } from '../../../qwik-city/runtime/src/service-worker/types';
import type { PrefetchResource } from './types';

export function workerFetchScript() {
  const fetch = `Promise.all(e.data.map(u=>fetch(u))).finally(()=>{setTimeout(postMessage({}),9999)})`;

  const workerBody = `onmessage=(e)=>{${fetch}}`;

  const blob = `new Blob(['${workerBody}'],{type:"text/javascript"})`;

  const url = `URL.createObjectURL(${blob})`;

  let s = `const w=new Worker(${url});`;

  // `u` variable must somehow get within this closure
  s += `w.postMessage(u.map(u=>new URL(u,origin)+''));`;
  s += `w.onmessage=()=>{w.terminate()};`;

  return s;
}

export function prefetchUrlsEventScript(prefetchResources: PrefetchResource[]) {
  const data: QPrefetchData = {
    bundles: flattenPrefetchResources(prefetchResources).map((u) => u.split('/').pop()!),
  };
  return `document.dispatchEvent(new CustomEvent("qprefetch",{detail:${JSON.stringify(data)}}))`;
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
