type ReleaseStore = {
  resolved: Set<string>;
  resolvers: Map<string, Set<() => void>>;
};

// Each app bundle and the dev-server resolver rendezvous on this globalThis store.
export const getReleaseStore = (): ReleaseStore =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });

export const getReleaseKey = (requestId: string, releaseId: string): string =>
  `${requestId}:${releaseId}`;

export const waitForRelease = (requestId: string, releaseId: string): Promise<void> =>
  new Promise<void>((resolve) => {
    const store = getReleaseStore();
    const key = getReleaseKey(requestId, releaseId);
    if (store.resolved.has(key)) {
      resolve();
    } else {
      let resolvers = store.resolvers.get(key);
      if (!resolvers) {
        store.resolvers.set(key, (resolvers = new Set()));
      }
      resolvers.add(resolve);
    }
  });

// Runs produce after the test's release POST, or after timeoutMs when the route is not gated.
export const releaseGated = <T>(
  requestId: string,
  releaseId: string | null,
  produce: () => T,
  timeoutMs = 1000
): Promise<T> =>
  (releaseId
    ? waitForRelease(requestId, releaseId)
    : new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ).then(produce);
