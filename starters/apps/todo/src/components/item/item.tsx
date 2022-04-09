import {
  component$,
  useStore,
  Host,
  useEvent,
  useRef,
  useWatch$,
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
    const editInput = useRef<HTMLInputElement>();

    useWatch$((obs) => {
      const {current} = obs(editInput);
      if (current) {
        current.focus();
        current.selectionStart = current.selectionEnd = current.value.length;
      }
    });

    return (
      <Host class={{ completed: props.item.completed, editing: state.editing }}>
        <div class="view">
          <input
            class="toggle"
            type="checkbox"
            checked={props.item.completed}
            onClick$={() => {
              props.item.completed = !props.item.completed;
            }}
          />
          <label
            onDblclick$={async () => {
              state.editing = true;
            }}
          >
            {props.item.title}
          </label>
          <button
            class="destroy"
            onClick$={() => {
              const todoItem = props.item;
              props.todos.items = props.todos.items.filter((i) => i != todoItem);
            }}
          />
        </div>
        {state.editing ? (
          <input
            class="edit"
            ref={editInput}
            value={props.item.title}
            onBlur$={() => (state.editing = false)}
            onKeyup$={() => {
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
  },
  {
    tagName: 'li',
  }
);
