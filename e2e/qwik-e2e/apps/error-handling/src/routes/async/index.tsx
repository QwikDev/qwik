import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useServerData,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const releaseStore = () =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });

const waitForRelease = (requestId: string, releaseId: string): Promise<void> =>
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

const ReleaseButton = component$<{ id: string; requestId: string; releaseId: string | null }>(
  ({ id, requestId, releaseId }) => {
    if (!releaseId) {
      return null;
    }
    const releaseUrl = `/__ooos-release/${encodeURIComponent(requestId)}/${encodeURIComponent(
      releaseId
    )}`;
    const html = `<button id="${id}" data-release-url="${releaseUrl}" onclick="fetch(this.getAttribute('data-release-url'),{method:'POST'})">Release deferred throw</button>`;
    return <span dangerouslySetInnerHTML={html} />;
  }
);

const EbAsyncThrower = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      if (releaseId) {
        return waitForRelease(requestId, releaseId).then(() => {
          throw new Error('eb async boom');
        }) as unknown as JSXOutput;
      }
      return new Promise<JSXOutput>((_resolve, reject) => {
        setTimeout(() => reject(new Error('eb async boom')), 1000);
      }) as unknown as JSXOutput;
    }
    return <span id="eb-async-client" />;
  }
);

export default component$(() => {
  const url = useServerData<string>('url');
  const releaseId = url ? new URL(url).searchParams.get('release') : null;
  const requestId = useSignal(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  ).value;
  return (
    <>
      <ErrorBoundary fallback$={defaultFallback}>
        <div id="eb-sibling">sibling</div>
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbAsyncThrower requestId={requestId} releaseId={releaseId} />
        </Suspense>
      </ErrorBoundary>
      <ReleaseButton id="eb-release" requestId={requestId} releaseId={releaseId} />
    </>
  );
});
