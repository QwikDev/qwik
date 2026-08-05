import { Show, component$, useSignal } from '@qwik.dev/core';

export const ShowRoot = component$(() => {
  const withElse = useSignal(false);
  const withoutElse = useSignal(false);
  const interactive = useSignal(true);
  const branchCount = useSignal(0);
  const item = useSignal<string | null>(null);

  return (
    <>
      <h1>Show</h1>

      <div id="initial-true">
        <Show when$={() => true} then$={() => <span>Initial then</span>} />
      </div>

      <div id="initial-false">
        <Show when$={() => false} then$={() => <span>Then</span>} else$={() => <span>Else</span>} />
      </div>

      <div id="initial-empty">
        <Show when$={() => false} then$={() => <span>Empty then</span>} />
      </div>

      <button id="toggle-with-else" onClick$={() => (withElse.value = !withElse.value)}>
        Toggle with else
      </button>
      <div id="toggle-with-else-result">
        <Show
          when$={() => withElse.value}
          then$={() => <span>Shown</span>}
          else$={() => <span>Hidden</span>}
        />
      </div>

      <button id="toggle-without-else" onClick$={() => (withoutElse.value = !withoutElse.value)}>
        Toggle without else
      </button>
      <div id="toggle-without-else-result">
        <Show when$={() => withoutElse.value} then$={() => <span>Present</span>} />
      </div>

      <button id="toggle-interactive" onClick$={() => (interactive.value = !interactive.value)}>
        Toggle interactive
      </button>
      <div id="interactive-result">
        <Show
          when$={() => interactive.value}
          then$={() => (
            <button id="branch-action" onClick$={() => branchCount.value++}>
              Inside {branchCount.value}
            </button>
          )}
          else$={() => <span>Interactive else</span>}
        />
      </div>
      <div id="branch-count">{branchCount.value}</div>

      <button id="set-item" onClick$={() => (item.value = 'hello')}>
        Set item
      </button>
      <div id="item-result">
        <Show
          when$={() => item.value}
          then$={(v) => <span>Got: {v}</span>}
          else$={() => <span>No value</span>}
        />
      </div>
    </>
  );
});
