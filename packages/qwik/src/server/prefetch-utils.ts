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

export function getMostReferenced(prefetchResources: PrefetchResource[]) {
  const common = new Map<string, number>();
  let total = 0;
  const addPrefetchResource = (prefetchResources: PrefetchResource[], visited: Set<string>) => {
    if (Array.isArray(prefetchResources)) {
      for (const prefetchResource of prefetchResources) {
        const count = common.get(prefetchResource.url) || 0;
        common.set(prefetchResource.url, count + 1);
        total++;

        if (!visited.has(prefetchResource.url)) {
          visited.add(prefetchResource.url);
          addPrefetchResource(prefetchResource.imports, visited);
        }
      }
    }
  };
  const visited = new Set<string>();
  for (const resource of prefetchResources) {
    visited.clear();
    addPrefetchResource(resource.imports, visited);
  }
  const threshold = (total / common.size) * 2.0;
  const urls = Array.from(common.entries());
  urls.sort((a, b) => b[1] - a[1]);
  return urls
    .slice(0, 5)
    .filter((e) => e[1] > threshold)
    .map((e) => e[0]);
}
