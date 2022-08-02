import type { PrefetchResource } from './types';

export function workerFetchScript() {
  const fetch = `Promise.all(e.data.map(u=>fetch(u,{priority:"low"}))).finally(()=>{setTimeout(postMessage({}),999)})`;

  const workerBody = `onmessage=(e)=>{${fetch}}`;

  const blob = `new Blob(['${workerBody}'],{type:"text/javascript"})`;

  const url = `URL.createObjectURL(${blob})`;

  let s = `const w=new Worker(${url});`;
  s += `w.postMessage(u.map(u=>new URL(u,origin)+''));`;
  s += `w.onmessage=()=>{w.terminate()};`;

  return s;
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
