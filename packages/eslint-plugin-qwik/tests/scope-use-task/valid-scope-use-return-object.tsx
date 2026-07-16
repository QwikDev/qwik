import { component$, useTask$, isBrowser, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const state = useSignal(true);
  useTask$(({ track }) => {
    if (isBrowser) {
      track(() => {
        if (state.value) {
          const values = [
            {
              // `path` will be treated as a built-in node API under isBrowser
              path: '1',
            },
          ];
        }
      });
      const process = { cwd: 'hi' };
    }
  });
  return <></>;
});
