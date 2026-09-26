import { component$, Catch, Pending, useSignal } from '@qwik.dev/core';
import { CatchWrapAsync, CatchWrapper, errMsg } from '../../components/catch/catch';

export default component$(() => {
  const attempt = useSignal(0);
  return (
    <Pending fallback$={() => <span id="catch-skel">loading</span>}>
      <CatchWrapper>
        <Catch
          key={attempt.value}
          fallback$={(e) => (
            <section id="catch-fallback">
              <p id="catch-fallback-msg">caught: {errMsg(e)}</p>
              <button id="catch-reset" onClick$={() => attempt.value++}>
                Retry
              </button>
            </section>
          )}
        >
          <CatchWrapAsync />
        </Catch>
      </CatchWrapper>
    </Pending>
  );
});
