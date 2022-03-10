import {
  component$,
  useStore,
  Host,
  notifyRender,
  $,
  useEvent,
  useHostElement,
} from '@builder.io/qwik';
import type { TodoItem, Todos } from '../../state/state';

/**
 * Individual items of the component.
 *
 * It only rerenders if the user infarcts with it or if the item itself changes.
 */
export const Item = component$(
  (props: { item: TodoItem; todos: Todos }) => {
    const state = useStore({ editing: false });
    return $(() => {
      return (
        <Host class={{ completed: props.item.completed, editing: state.editing }}>
          <div class="view">
            <input
              class="toggle"
              type="checkbox"
              checked={props.item.completed}
              on$:click={() => {
                props.item.completed = !props.item.completed;
              }}
            />
            <label
              on$:dblclick={async () => {
                state.editing = true;
                const hostElement = useHostElement()!;
                await notifyRender(hostElement);
                const inputEl = hostElement.querySelector('input.edit') as HTMLInputElement;
                inputEl.focus();
                inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
              }}
            >
              {props.item.title}
            </label>
            <button
              class="destroy"
              on$:click={() => {
                const todoItem = props.item;
                props.todos.items = props.todos.items.filter((i) => i != todoItem);
              }}
            />
          </div>
          {state.editing ? (
            <input
              class="edit"
              value={props.item.title}
              on$:blur={() => (state.editing = false)}
              on$:keyup={() => {
                const event = useEvent<KeyboardEvent>();
                const inputValue = (event.target as HTMLInputElement).value;
                props.item.title = inputValue;
                if (event.key === 'Enter') {
                  state.editing = false;
                }
              }}
            />
          ) : null}
        </Host>
      );
    });
  },
  {
    tagName: 'li',
  }
);
