import { component$, Catch, isServer, Pending, useSignal, type JSXOutput } from '@qwik.dev/core';
import { CatchReErrorAsync, resetFallback } from '../../components/catch/catch';

export default component$(() => {
  const spaShow = useSignal(false);
  return (
    <>
      <button id="catch-spa-show" onClick$={() => (spaShow.value = true)}>
        Show
      </button>
      {spaShow.value ? (
        <Pending fallback$={() => <span id="catch-skel">loading</span>}>
          <Catch fallback$={resetFallback}>
            <CatchReErrorAsync />
          </Catch>
        </Pending>
      ) : null}
    </>
  );
});
