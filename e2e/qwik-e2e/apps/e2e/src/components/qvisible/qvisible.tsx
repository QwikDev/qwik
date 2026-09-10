import { component$, useSignal, useVisibleTask$, type Signal } from '@qwik.dev/core';

export const QVisibleRoot = component$(() => {
  const showClientSentinel = useSignal(false);
  const showClientTaskSentinel = useSignal(false);
  const log = useSignal('');
  const taskRuns = useSignal(0);
  return (
    <div>
      <p id="log" style={{ position: 'fixed', top: 0, right: 0 }}>
        {log.value}
      </p>
      <p id="task-runs" style={{ position: 'fixed', top: '20px', right: 0 }}>
        {taskRuns.value}
      </p>
      <button id="show" onClick$={() => (showClientSentinel.value = true)}>
        Show client sentinel
      </button>
      <button id="show-task" onClick$={() => (showClientTaskSentinel.value = true)}>
        Show client task sentinel
      </button>
      {showClientSentinel.value && (
        <div
          id="csr-sentinel"
          style={{ marginTop: '2000px' }}
          onQVisible$={() => (log.value += 'csr-visible;')}
        >
          client-rendered sentinel
        </div>
      )}
      {showClientTaskSentinel.value && (
        <VisibleTaskSentinel id="csr-task-sentinel" prefix="csr-task" log={log} runs={taskRuns} />
      )}
      <div
        id="ssr-sentinel"
        style={{ marginTop: '2000px' }}
        onQVisible$={() => (log.value += 'ssr-visible;')}
      >
        server-rendered sentinel
      </div>
      <VisibleTaskSentinel id="ssr-task-sentinel" prefix="ssr-task" log={log} runs={taskRuns} />
    </div>
  );
});

export const VisibleTaskSentinel = component$<{
  id: string;
  prefix: string;
  log: Signal<string>;
  runs: Signal<number>;
}>(({ id, prefix, log, runs }) => {
  useVisibleTask$(() => {
    log.value += `${prefix};`;
    runs.value++;
  });
  return (
    <div id={id} style={{ marginTop: '2000px' }}>
      {prefix} sentinel
    </div>
  );
});
