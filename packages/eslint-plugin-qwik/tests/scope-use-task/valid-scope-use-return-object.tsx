import { component$, useTask$, isBrowser, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const state = useSignal(true);
  process.env;
  useTask$(({ track }) => {
    if (isBrowser) {
      track(() => {
        if (state.value) {
          const values = [
            {
              relativePath: '',
              name: 'index',
              type: '',
              path: '',
              isSymbolicLink: false,
              children: undefined,
            },
          ];
        }
      });
    }
  });
  return <></>;
});
