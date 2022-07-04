import {
  component$,
  createContext,
  useContextProvider,
  useContext,
  useStore,
} from '@builder.io/qwik';

//
// <docs anchor="context">
// Declare the Context type.
interface TodosStore {
  items: string[];
}
// Create a Context ID (no data is saved here.)
// You will use this ID to both create and retrieve the Context.
export const TodosContext = createContext<TodosStore>('Todos');

// Example of providing context to child components.
export const App = component$(() => {
  useContextProvider(
    TodosContext,
    useStore<TodosStore>({
      items: ['Learn Qwik', 'Build Qwik app', 'Profit'],
    })
  );

  return <Items />;
});

// Example of retrieving the context provided by a parent component.
export const Items = component$(() => {
  const todos = useContext(TodosContext);
  return (
    <ul>
      {todos.items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  );
});

// </docs>
//
