import { component$, createContextId, useContextProvider, useStore } from '@builder.io/qwik';

interface TodosStore {
  items: string[];
}
export const todosContext = createContextId<TodosStore>('Todos');
export default component$(() => {
  useContextProvider(
    todosContext,
    useStore<TodosStore>({
      items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
    })
  );

  return <Items />;
});

export const Items = component$(() => {
  // replace this with context retrieval.
  const todos = { items: [] };
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});
