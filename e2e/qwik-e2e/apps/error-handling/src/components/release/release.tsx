import { component$, isServer, type JSXOutput } from '@qwik.dev/core';

// Waiter half of the release gate; dev-server's /__ooos-release endpoint resolves it via globalThis.
const releaseStore = () =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });

export const waitForRelease = (requestId: string, releaseId: string): Promise<void> =>
  new Promise<void>((resolve) => {
    const store = releaseStore();
    const key = `${requestId}:${releaseId}`;
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

// Raw inline onclick on purpose: the held stream means no framework JS has loaded yet.
export const ReleaseButton = component$<{
  id: string;
  requestId: string;
  releaseId: string | null;
  label: string;
}>(({ id, requestId, releaseId, label }) => {
  if (!releaseId) {
    return null;
  }
  const releaseUrl = `/__ooos-release/${encodeURIComponent(requestId)}/${encodeURIComponent(
    releaseId
  )}`;
  const html = `<button id="${id}" data-release-url="${releaseUrl}" onclick="fetch(this.getAttribute('data-release-url'),{method:'POST'})">${label}</button>`;
  return <span dangerouslySetInnerHTML={html} />;
});

export const EbGatedOk = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      if (releaseId) {
        return waitForRelease(requestId, releaseId).then(() => (
          <span id="eb-deferred-ok">deferred ok</span>
        )) as unknown as JSXOutput;
      }
      return new Promise<JSXOutput>((resolve) => {
        setTimeout(() => resolve(<span id="eb-deferred-ok">deferred ok</span>), 1000);
      }) as unknown as JSXOutput;
    }
    return <span id="eb-deferred-ok">deferred ok</span>;
  }
);
