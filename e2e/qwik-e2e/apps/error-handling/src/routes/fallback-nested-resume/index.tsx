import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbAlwaysThrower,
  EbSyncThrower,
  errMsg,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary
    fallback$={(e) => (
      <section id="eb-outer-fb">
        <p id="eb-outer-fb-msg">outer: {errMsg(e)}</p>
        <ErrorBoundary
          fallback$={(ie, reset) => (
            <section id="eb-inner-fb">
              <p id="eb-inner-fb-msg">inner: {errMsg(ie)}</p>
              <button id="eb-inner-reset" onClick$={() => reset()}>
                Retry inner
              </button>
            </section>
          )}
        >
          <EbSyncThrower />
        </ErrorBoundary>
      </section>
    )}
  >
    <EbAlwaysThrower />
  </ErrorBoundary>
));
