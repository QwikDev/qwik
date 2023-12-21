import type { SWGraph } from './process-message';
import type { SWState, SWStateBase, SWTask } from './state';

const DIRECT_PRIORITY = Number.MAX_SAFE_INTEGER >>> 1;

export async function directFetch(swState: SWState, url: URL): Promise<Response | undefined> {
  const [basePath, filename] = parseBaseFilename(url);
  const base = swState.$bases$.find((base) => basePath === base.$path$);
  if (base) {
    // Check if direct here
    // Ignore any request which we are not aware of through base.
    await enqueueFileAndDependencies(swState, base, [filename], DIRECT_PRIORITY);
    return getResponse(swState, url);
  }
  return undefined;
}

export async function enqueueFileAndDependencies(
  swState: SWState,
  base: SWStateBase,
  filenames: string[],
  priority: number
) {
  const fetchSet = new Set<string>();
  filenames.forEach((filename) => addDependencies(base.$graph$, fetchSet, filename));
  await Promise.all(
    Array.from(fetchSet).map((filename) =>
      enqueueFetchIfNeeded(swState, new URL(base.$path$ + filename, swState.$url$), priority)
    )
  );
  taskTick(swState);
}

async function getResponse(swState: SWState, url: URL): Promise<Response> {
  const currentRequestTask = swState.$queue$.find((task) => task.$url$.pathname === url.pathname)!;
  if (!currentRequestTask) {
    return swState.$cache$!.match(url) as Promise<Response>;
  } else {
    return currentRequestTask.$response$;
  }
}

async function enqueueFetchIfNeeded(swState: SWState, fetchURL: URL, priority: number) {
  let task = swState.$queue$.find((task) => task.$url$.pathname === fetchURL.pathname);
  if (task) {
    task.$priority$ = Math.max(task.$priority$, priority);
  } else {
    const cacheEntry = await swState.$cache$!.match(fetchURL);
    if (!cacheEntry) {
      task = {
        $priority$: priority,
        $url$: fetchURL,
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
      outstandingRequests < swState.$maxPrefetchRequests$ ||
      task.$priority$ >= DIRECT_PRIORITY
    ) {
      task.$isFetching$ = true;
      outstandingRequests++;
      swState
        .$fetch$(task.$url$)
        .then(async (response) => {
          if (response.status === 200) {
            await swState.$cache$!.put(task.$url$, response.clone());
          }
          task.$resolveResponse$(response);
        })
        .finally(() => {
          swState.$queue$.splice(swState.$queue$.indexOf(task), 1);
          taskTick(swState);
        });
    }
  }
}

export function byFetchOrder(a: SWTask, b: SWTask) {
  return b.$priority$ - a.$priority$;
}

export function addDependencies(graph: SWGraph, fetchSet: Set<string>, filename: string) {
  if (!fetchSet.has(filename)) {
    fetchSet.add(filename);
    let index = graph.findIndex((file) => file === filename);
    if (index !== -1) {
      while (typeof graph[++index] === 'number') {
        const dependentIdx = graph[index] as number;
        const dependentFilename = graph[dependentIdx] as string;
        addDependencies(graph, fetchSet, dependentFilename);
      }
    }
  }
  return fetchSet;
}
export function parseBaseFilename(url: URL): [string, string] {
  const pathname = new URL(url).pathname;
  const slashIndex = pathname.lastIndexOf('/');
  return [pathname.substring(0, slashIndex + 1), pathname.substring(slashIndex + 1)];
}
