import type { PrefetchResource } from './types';

export function flattenPrefetchResources(prefetchResources: PrefetchResource[]) {
  const urls: string[] = [];
  const addPrefetchResource = (prefetchResources?: PrefetchResource[]) => {
    if (prefetchResources) {
      for (const prefetchResource of prefetchResources) {
        if (!urls.includes(prefetchResource.url)) {
          urls.push(prefetchResource.url);
          if (prefetchResource.imports) {
            addPrefetchResource(prefetchResource.imports);
          }
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
    if (prefetchResources) {
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
