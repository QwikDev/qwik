import { component$, useTask$, isBrowser, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const state = useSignal(true);
  useTask$(({ track }) => {
    if (isBrowser) {
      track(() => {
        if (state.value) {
          const values = [
            {
              path: '1',
            },
          ];
        }
      });
    }
  });
  return <></>;
});
