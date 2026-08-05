import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

// blockSSR:false runs in the background and must not block or error the initial SSR response.
export const useBackgroundError = routeLoader$(
  async ({ error }): Promise<string> => {
    throw error(401, 'background-loader-error');
  },
  { blockSSR: false }
);

// A background loader returning fail() must surface the failed value on its signal without leaking
// its status (or crashing via check()) onto the page response.
export const useBackgroundFail = routeLoader$(
  async ({ fail }) => fail(418, { reason: 'background-fail' }),
  { blockSSR: false }
);

export default component$(() => {
  useBackgroundError();
  const failed = useBackgroundFail();
  return (
    <div id="non-blocking-rendered">
      rendered
      <span id="non-blocking-fail">{failed.value.reason}</span>
    </div>
  );
});
