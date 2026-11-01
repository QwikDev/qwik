import { component$, useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

declare global {
  interface Window {
    __visibleTaskCleanupLog: string[];
  }
}

const log = (msg: string) => {
  (window.__visibleTaskCleanupLog ||= []).push(msg);
};

export const Tracked = component$(() => {
  const ready = useSignal(false);

  useVisibleTask$(({ cleanup }) => {
    log('visible task: ran');
    cleanup(() => log('visible task: cleanup'));
    ready.value = true;
  });

  // Render blocking by default, and never settles.
  useTask$(async ({ track }) => {
    track(ready);
    if (ready.value) {
      log('async task: pending');
      await new Promise(() => {});
    }
  });

  return <p id="tracked">tracked</p>;
});

export default component$(() => {
  return (
    <>
      <Tracked />
      <Link id="leave" href="/qwikrouter-test/visible-task-cleanup/other/">
        leave
      </Link>
    </>
  );
});
