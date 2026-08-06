import { useSignal, useStore } from '@qwik.dev/core';

export function App() {
  const todos = useStore({ filter: 'all', count: 2 });
  const show = useSignal(true);
  function Filter({ name }: { name: string }) {
    const lower = name.toLowerCase();
    return (
      <li>
        <a
          class={{ selected: todos.filter == lower }}
          onClick$={() => {
            todos.filter = lower;
          }}
        >
          {name.toUpperCase()}
        </a>
      </li>
    );
  }
  return <ul>{show.value ? <Filter name="All" /> : null}</ul>;
}
