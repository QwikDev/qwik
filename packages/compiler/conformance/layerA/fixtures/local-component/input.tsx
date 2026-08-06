import { useStore } from '@qwik.dev/core';

export function App() {
  const todos = useStore({ filter: 'all', count: 2 });
  function Filter({ name }: { name: string }) {
    const lower = name.toLowerCase();
    function Star({ on }: { on: boolean }) {
      return <b class={{ on: on && todos.filter == lower }}>*</b>;
    }
    return (
      <li>
        <a
          class={{ selected: todos.filter == lower }}
          onClick$={() => {
            todos.filter = lower;
          }}
        >
          <Star on={true} />
          {name.toUpperCase()}
        </a>
      </li>
    );
  }
  return (
    <ul>
      {['All', 'Active'].map((f) => (
        <Filter name={f} key={f} />
      ))}
      <Filter name="Done" />
    </ul>
  );
}
