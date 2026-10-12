import { $, Catch, component$, useComputed$, useSignal } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import {
  CatchFallback,
  defaultFallback,
} from '../../../../error-handling/src/components/catch/catch';

export default component$(() => {
  const form = useLocation().url.searchParams.get('form');
  const failed = useSignal(false);
  const prefix = useSignal('captured');
  const value = useComputed$(() => {
    if (failed.value) {
      throw new Error('client render failed');
    }
    return 'ready';
  });
  const localFallback = $((error: Error) => {
    return <CatchFallback msg={`${prefix.value}: ${error.message}`} />;
  });
  return (
    <>
      <button id="catch-fail" onClick$={() => (failed.value = true)}>
        Fail render
      </button>
      {form === 'inline' ? (
        <Catch
          fallback$={(error) => {
            return <CatchFallback msg={`${prefix.value}: ${error.message}`} />;
          }}
        >
          <p id="catch-content">{value.value}</p>
        </Catch>
      ) : form === 'dollar' ? (
        <Catch
          fallback$={$((error) => {
            return <CatchFallback msg={`${prefix.value}: ${error.message}`} />;
          })}
        >
          <p id="catch-content">{value.value}</p>
        </Catch>
      ) : form === 'local' ? (
        <Catch fallback$={localFallback}>
          <p id="catch-content">{value.value}</p>
        </Catch>
      ) : (
        <Catch fallback$={defaultFallback}>
          <p id="catch-content">{value.value}</p>
        </Catch>
      )}
    </>
  );
});
