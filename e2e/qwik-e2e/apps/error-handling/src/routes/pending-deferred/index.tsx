import { component$, Catch, isServer, Pending, type JSXOutput } from '@qwik.dev/core';
import { defaultFallback, CatchContent, CatchSyncThrower } from '../../components/catch/catch';

const CatchDeferredOk = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<span id="catch-deferred-ok">deferred ok</span>), 50);
    }) as unknown as JSXOutput;
  }
  return <span id="catch-deferred-ok">deferred ok</span>;
});

export default component$(() => (
  <Pending fallback={<span id="catch-skel">loading</span>}>
    <CatchDeferredOk />
    <Catch fallback$={defaultFallback}>
      <CatchContent />
      <CatchSyncThrower />
    </Catch>
  </Pending>
));
