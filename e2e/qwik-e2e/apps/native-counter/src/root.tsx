import { useComputed$, useSignal, useStore } from '@qwik.dev/core';

export function Root() {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);
  const todos = useStore({ filter: 'all' });
  function FilterButton({ name }: { name: string }) {
    const lower = name.toLowerCase();
    return (
      <button
        id={'filter-' + lower}
        class={{ selected: todos.filter == lower }}
        onClick$={() => {
          todos.filter = lower;
        }}
      >
        {name}
      </button>
    );
  }
  return (
    <main>
      <button id="inc" onClick$={() => count.value++}>
        +1
      </button>
      <span id="count">{count.value}</span>
      <span id="doubled">{doubled.value}</span>
      <FilterButton name="All" />
      <FilterButton name="Active" />
      <span id="filter">{todos.filter}</span>
    </main>
  );
}
