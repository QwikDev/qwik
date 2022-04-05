import { component$, Host, $ } from '@builder.io/qwik';
import { FILTERS, Todos } from '../../state/state';
import { Item } from '../item/item';

/**
 * Main body of the application which contains the list of todo items.
 *
 * This component only rerenders/hydrates/downloads if the list of todos changes.
 */
export const Body = component$((props: { todos: Todos }) => {
  return $(() => {
    return (
      <Host class="main">
        <ul class="todo-list">
          {props.todos.items.filter(FILTERS[props.todos.filter]).map((key) => (
            <Item item={key} todos={props.todos} />
          ))}
        </ul>
      </Host>
    );
  });
});
