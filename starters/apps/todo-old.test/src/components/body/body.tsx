import { component$, Host } from '@builder.io/qwik';
import { FILTERS, Todos } from '../../state/state';
import { Item } from '../item/item';

interface BodyProps {
  todos: Todos;
}
export const Body = component$(({ todos }: BodyProps) => {
  return (
    <Host class="main">
      <ul class="todo-list">
        {todos.items.filter(FILTERS[todos.filter]).map((key) => (
          <Item item={key} todos={todos} />
        ))}
      </ul>
    </Host>
  );
});
