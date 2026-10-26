import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export const VisibleTaskOrderRoot = component$(() => {
  return (
    <div>
      <DependentVisibleTasks />
      <SlowVisibleTask />
    </div>
  );
});

export const DependentVisibleTasks = component$(() => {
  const isOpen = useSignal(true);
  const queryStatus = useSignal('idle');
  const refStatus = useSignal('idle');
  const targetRef = useSignal<Element>();

  useVisibleTask$(async () => {
    await Promise.resolve();
    isOpen.value = false;
  });

  useVisibleTask$(({ track }) => {
    if (track(isOpen)) {
      return;
    }
    queryStatus.value = document.querySelector('#target') ? 'found' : 'missing';
  });

  useVisibleTask$(({ track }) => {
    if (track(targetRef)) {
      refStatus.value = 'found';
    }
  });

  return (
    <div>
      <p id="query-status">{queryStatus.value}</p>
      <p id="ref-status">{refStatus.value}</p>
      {!isOpen.value && (
        <div id="target" ref={targetRef}>
          target
        </div>
      )}
    </div>
  );
});

export const SlowVisibleTask = component$(() => {
  const hasRun = useSignal(false);

  useVisibleTask$(() => {
    hasRun.value = true;
  });

  return (
    <div>
      <SlowVisibleTaskCounter />
      <p id="slow-task-status">{hasRun.value ? 'ran' : 'pending'}</p>
    </div>
  );
});

export const SlowVisibleTaskCounter = component$(() => {
  const count = useSignal(0);
  return (
    <button id="slow-task-counter" onClick$={() => count.value++}>
      {count.value}
    </button>
  );
});
