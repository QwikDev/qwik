import { Slot, component$, isBrowser, useSignal, useTask$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export default component$(() => {
  const location = useLocation();
  const taskUrls = useSignal<string[]>([]);

  useTask$(({ track }) => {
    const pathname = track(() => location.url.pathname);
    if (isBrowser) {
      taskUrls.value = [...taskUrls.value, pathname];
    }
  });

  return (
    <>
      <output id="issue9333-layout-task-urls">{JSON.stringify(taskUrls.value)}</output>
      <Slot />
    </>
  );
});
