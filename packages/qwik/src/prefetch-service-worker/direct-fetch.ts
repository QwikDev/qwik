import type { SWState, SWStateBase, SWTask } from './state';

const DIRECT_PRIORITY = Number.MAX_SAFE_INTEGER >>> 1;

export function directFetch(swState: SWState, url: URL): Promise<Response> | undefined {
  const [basePath, filename] = parseBaseFilename(url);
  const base = swState.$bases$.find((base) => basePath === base.$path$);
  if (base) {
    swState.$log$('intercepting', url.pathname);
    // Check if direct here
    // Ignore any request which we are not aware of through base.
    return enqueueFileAndDependencies(swState, base, [filename], DIRECT_PRIORITY).then(() =>
      getResponse(swState, url)
    );
  }
  return undefined;
}

export async function enqueueFileAndDependencies(
  swState: SWState,
  base: SWStateBase,
  filenames: string[],
  priority: number
) {
  const fetchMap = new Map<string, number>();
  filenames.forEach((filename) => addDependencies(base, fetchMap, filename, priority));
  await Promise.all(
    Array.from(fetchMap.entries()).map(([filename, prio]) =>
      enqueueFetchIfNeeded(swState, new URL(base.$path$ + filename, swState.$url$.origin), prio)
    )
  );
  taskTick(swState);
}

function getResponse(swState: SWState, url: URL): Promise<Response> {
  const currentRequestTask = swState.$queue$.find((task) => task.$url$.pathname === url.pathname)!;
  if (!currentRequestTask) {
    swState.$log$('CACHE HIT', url.pathname);
    return swState.$match$(url) as Promise<Response>;
  } else {
    return currentRequestTask.$response$.then((response) => response.clone());
  }
}

async function enqueueFetchIfNeeded(swState: SWState, url: URL, priority: number) {
  let task = swState.$queue$.find((task) => task.$url$.pathname === url.pathname);
  const mode = priority >= DIRECT_PRIORITY ? 'direct' : 'prefetch';
  if (task) {
    const state = task.$isFetching$ ? 'fetching' : 'waiting';
    if (task.$priority$ < priority) {
      swState.$log$('queue update priority', state, url.pathname);
      task.$priority$ = priority;
    } else {
      swState.$log$('already in queue', mode, state, url.pathname);
    }
  } else {
    const cacheEntry = await swState.$match$(url);
    if (!cacheEntry) {
      swState.$log$('enqueue', mode, url.pathname);
      task = {
        $priority$: priority,
        $url$: url,
        $resolveResponse$: null!,
        $response$: null!,
        $isFetching$: false,
      };
      task.$response$ = new Promise<Response>((resolve) => (task!.$resolveResponse$ = resolve));
      swState.$queue$.push(task);
    }
  }
  return task;
}

function taskTick(swState: SWState) {
  swState.$queue$.sort(byFetchOrder);
  let outstandingRequests = 0;
  for (const task of swState.$queue$) {
    if (task.$isFetching$) {
      outstandingRequests++;
    } else if (
      swState.$getCache$() &&
      (outstandingRequests < swState.$maxPrefetchRequests$ || task.$priority$ >= DIRECT_PRIORITY)
    ) {
      task.$isFetching$ = true;
      outstandingRequests++;
      const action = task.$priority$ >= DIRECT_PRIORITY ? 'FETCH (CACHE MISS)' : 'FETCH';
      swState.$log$(action, task.$url$.pathname);
      swState
        .$fetch$(task.$url$)
        .then(async (response) => {
          task.$resolveResponse$(response);
          if (response.status === 200) {
            swState.$log$('CACHED', task.$url$.pathname);
            await swState.$put$(task.$url$, response.clone());
          }
        })
        .finally(() => {
          swState.$log$('FETCH DONE', task.$url$.pathname);
          swState.$queue$.splice(swState.$queue$.indexOf(task), 1);
          taskTick(swState);
        });
    }
  }
}

export function byFetchOrder(a: SWTask, b: SWTask) {
  return b.$priority$ - a.$priority$;
}

export function addDependencies(
  base: SWStateBase,
  fetchMap: Map<string, number>,
  filename: string,
  priority: number,
  addIndirect: boolean = true
) {
  if (!fetchMap.has(filename)) {
    fetchMap.set(filename, priority);
    if (!base.$processed$) {
      base.$processed$ = new Map();
      // Process the graph so we don't walk thousands of entries on every lookup.
      let current: { $direct$: string[]; $indirect$: string[] }, isDirect;
      for (let i = 0; i < base.$graph$.length; i++) {
        const item = base.$graph$[i];
        if (typeof item === 'string') {
          current = { $direct$: [], $indirect$: [] };
          isDirect = true;
          base.$processed$.set(item, current);
        } else if (item === -1) {
          isDirect = false;
        } else {
          const depName = base.$graph$[item] as string;
          if (isDirect) {
            current!.$direct$.push(depName);
          } else {
            current!.$indirect$.push(depName);
          }
        }
      }
    }
    const deps = base.$processed$.get(filename);
    if (!deps) {
      return fetchMap;
    }
    for (const dependentFilename of deps.$direct$) {
      addDependencies(base, fetchMap, dependentFilename, priority);
    }
    if (addIndirect) {
      priority--;
      for (const dependentFilename of deps.$indirect$) {
        // don't add indirect deps of indirect deps
        addDependencies(base, fetchMap, dependentFilename, priority, false);
      }
    }
  }
  return fetchMap;
}
export function parseBaseFilename(url: URL): [string, string] {
  const pathname = new URL(url).pathname;
  const slashIndex = pathname.lastIndexOf('/');
  return [pathname.substring(0, slashIndex + 1), pathname.substring(slashIndex + 1)];
}
