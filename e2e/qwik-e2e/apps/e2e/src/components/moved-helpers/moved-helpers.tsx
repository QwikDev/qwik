import { component$, useSignal, useTask$, type Signal } from '@qwik.dev/core';

const ArrowRow = () => (
  <button id="arrow-row" onClick$={(_, el) => (el.textContent = 'arrow clicked')}>
    arrow
  </button>
);

function FunctionRow() {
  return (
    <button id="function-row" onClick$={(_, el) => (el.textContent = 'function clicked')}>
      function
    </button>
  );
}

const useStatusTask = (status: Signal<string>) => {
  useTask$(() => {
    status.value = 'task ran';
  });
};

export const ArrowRowHost = component$(() => <ArrowRow />);

export const FunctionRowHost = component$(() => <FunctionRow />);

export const TaskHookHost = component$(() => {
  const status = useSignal('task pending');
  useStatusTask(status);
  return <p id="task-status">{status.value}</p>;
});

export const MovedHelpers = component$(() => {
  const showArrowRow = useSignal(false);
  const showFunctionRow = useSignal(false);
  const showTaskHook = useSignal(false);
  return (
    <div>
      <button id="show-arrow-row" onClick$={() => (showArrowRow.value = true)}>
        show arrow row
      </button>
      <button id="show-function-row" onClick$={() => (showFunctionRow.value = true)}>
        show function row
      </button>
      <button id="show-task-hook" onClick$={() => (showTaskHook.value = true)}>
        show task hook
      </button>
      {showArrowRow.value && <ArrowRowHost />}
      {showFunctionRow.value && <FunctionRowHost />}
      {showTaskHook.value && <TaskHookHost />}
    </div>
  );
});
