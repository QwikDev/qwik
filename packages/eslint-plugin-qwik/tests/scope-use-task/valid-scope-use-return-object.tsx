import { component$, useTask$, isBrowser, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const state = useSignal(true);
  useTask$(({ track }) => {
    if (isBrowser) {
      track(() => {
        if (state.value) {
          // `path` will be treated as a built-in node API under isBrowser
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
