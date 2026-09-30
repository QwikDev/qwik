import { component$, useSignal } from '@qwik.dev/core';
import { routeAction$ } from '@qwik.dev/router';

export const useFirstAction = routeAction$(() => 'first');
export const useSecondAction = routeAction$(() => 'second');
export const useRepeatedAction = routeAction$(({ value }: { value: string }) => value);

export default component$(() => {
  const first = useFirstAction();
  const second = useSecondAction();
  const repeated = useRepeatedAction();
  const repeatedResults = useSignal('pending');

  return (
    <>
      <button
        id="different-actions"
        onClick$={() => {
          first.submit();
          second.submit();
        }}
      >
        Run different actions
      </button>
      <output id="different-actions-result">
        {first.value ?? 'pending'}:{second.value ?? 'pending'}
      </output>

      <button
        id="same-action"
        onClick$={async () => {
          const results = await Promise.all([
            repeated.submit({ value: 'first' }),
            repeated.submit({ value: 'second' }),
          ]);
          repeatedResults.value = results.map(({ value }) => value).join(':');
        }}
      >
        Run same action twice
      </button>
      <output id="same-action-result">
        {repeatedResults.value}:{repeated.value ?? 'pending'}
      </output>
    </>
  );
});
