import { Each, component$, useSignal } from '@qwik.dev/core';

interface Todo {
  id: string;
  label: string;
}

export default component$(() => {
  const nextId = useSignal(4);
  const todos = useSignal<Todo[]>([
    { id: '1', label: 'Write docs' },
    { id: '2', label: 'Review keys' },
    { id: '3', label: 'Ship change' },
  ]);

  return (
    <>
      <button onClick$={() => (todos.value = [...todos.value].reverse())}>
        Reverse order
      </button>
      <button
        onClick$={() => {
          const id = String(nextId.value++);
          todos.value = [...todos.value, { id, label: `Task ${id}` }];
        }}
      >
        Add item
      </button>

      <ul>
        <Each
          items={todos.value}
          key$={(todo) => todo.id}
          item$={(todo) => <li>{todo.label}</li>}
        />
      </ul>
    </>
  );
});
