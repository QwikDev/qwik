import { component$, Host, $ } from '@builder.io/qwik';
import { getFilteredItems, Todos } from '../../state/state';
import { Item } from '../item/item';

/**
 * Main body of the application which contains the list of todo items.
 *
 * This component only rerenders/hydrates/downloads if the list of todos changes.
 */
export const Main = component$((props: { todos: Todos }) => {
  return $(() => {
    return (
      <Host class="main">
        <ul class="todo-list">
          {getFilteredItems(props.todos).map((key) => (
            <Item item={key} todos={props.todos} />
          ))}
        </ul>
      </Host>
    );
  });
});
