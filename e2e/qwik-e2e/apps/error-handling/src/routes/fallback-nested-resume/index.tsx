import { component$, Catch } from '@qwik.dev/core';
import { CatchAlwaysThrower, CatchSyncThrower, errMsg } from '../../components/catch/catch';

export default component$(() => (
  <Catch
    fallback$={(e) => (
      <section id="catch-outer-fb">
        <p id="catch-outer-fb-msg">outer: {errMsg(e)}</p>
        <Catch
          fallback$={(ie, reset) => (
            <section id="catch-inner-fb">
              <p id="catch-inner-fb-msg">inner: {errMsg(ie)}</p>
              <button id="catch-inner-reset" onClick$={() => reset()}>
                Retry inner
              </button>
            </section>
          )}
        >
          <CatchSyncThrower />
        </Catch>
      </section>
    )}
  >
    <CatchAlwaysThrower />
  </Catch>
));
