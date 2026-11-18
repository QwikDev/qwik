import { component$, useSignal } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

// Never built: `ignoreRoutes: ['dev/**']` in the fixture build keeps this whole folder out.
// The marker below is what the e2e test greps the published chunks and manifest for.
export const useIgnoredLoader = routeLoader$(async () => 'IGNORED_DEV_PAGE_MARKER_LOADER');

export default component$(() => {
  const clicks = useSignal(0);
  return <button onClick$={() => clicks.value++}>IGNORED_DEV_PAGE_MARKER {clicks.value}</button>;
});
