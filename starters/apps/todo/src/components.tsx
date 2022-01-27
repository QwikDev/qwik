import {
  Fragment,
  h,
  Host,
  component,
  onRender$,
  useStore,
  useHostElement,
  useEvent,
  $,
} from '@builder.io/qwik';
import {
  addItem,
  clearCompleted,
  FilterStates,
  getFilteredCount,
  getFilteredItems,
  removeItem,
  TodoItem,
  Todos,
  toggleItem,
  updateFilter,
} from './state';
/* eslint no-console: ["off"] */

// TODO(misko): APIs for better debugger experience: getProps
// TODO(misko): APIs for better debugger experience: dehydrate
// TODO(misko): APIs to have a global way of notifying which events are being fired, so we can console out render events in the demo applications
// TODO(misko): Place breakpoint in DOM modification and notice that too many writes are happening.
// TODO(misko): <item> renders twice on toggle. 1) Due to state change, 2) due to <main> somehow triggering render.

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

/**
 * Overall application component.
 *
 * This component is static (meaning it will never change). Because of this
 * Qwik knows that it should never need to be rerendered, and its code will never
 * download to the client.
 */
export const ToDoApp = component(
  'todo',
  $((props: { todos: Todos }) => {
    return onRender$(() => {
      console.log('on:qRender => <ToDoApp/>');
      return (
        <section class="todoapp">
          <Header todos={props.todos} />
          <Main todos={props.todos} />
          <Footer todos={props.todos} />
        </section>
      );
    });
  })
);

/**
 * Header component which is responsible for providing UI to ender new todo item.
 *
 * This component only rerenders if the user interacts with it through the input.
 */
export const Header = component(
  'header',
  $((props: { todos: Todos }) => {
    const state = useStore({ text: '' });
    return onRender$(() => {
      console.log('on:qRender => <Header/>');
      return (
        <>
          <h1>todos</h1>
          <input
            class="new-todo"
            placeholder="What needs to be done?"
            autoFocus
            value={state.text}
            on$:keyup={() => {
              const event = useEvent<KeyboardEvent>();
              const inputValue = (event.target as HTMLInputElement).value;
              state.text = inputValue;
              if (event.key === 'Enter' && inputValue) {
                addItem(props.todos, state.text);
                state.text = '';
              }
            }}
          />
        </>
      );
    });
  })
);

/**
 * Main body of the application which contains the list of todo items.
 *
 * This component only rerenders/hydrates/downloads if the list of todos changes.
 */
export const Main = component(
  'main',
  $((props: { todos: Todos }) => {
    return onRender$(() => {
      console.log('on:qRender => <Main/>');
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
  })
);

/**
 * Individual items of the component.
 *
 * It only rerenders if the user infarcts with it or if the item itself changes.
 */
export const Item = component(
  'li',
  $((props: { item: TodoItem; todos: Todos }) => {
    const state = useStore({ editing: false });
    return onRender$(() => {
      console.log(
        'on:qRender => <Item item="' +
          JSON.stringify(props.item, (key, value) => (key.startsWith('__') ? undefined : value)) +
          '"/>'
      );
      return (
        <Host class={{ completed: props.item.completed, editing: state.editing }}>
          <div class="view">
            <input
              class="toggle"
              type="checkbox"
              checked={props.item.completed}
              on$:click={() => toggleItem(props.todos, props.item)}
            />
            <label
              on$:dblclick={async () => {
                state.editing = true;
                const hostElement = useHostElement()!;
                await qNotifyRender(hostElement);
                const inputEl = hostElement.querySelector('input.edit') as HTMLInputElement;
                inputEl.focus();
                inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
              }}
            >
              {props.item.title}
            </label>
            <button class="destroy" on$:click={() => removeItem(props.todos, props.item)}></button>
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
  })
);

/**
 * Footer showing items remaining and filtering options
 *
 * It only rerenders if the todos count changes or filters are reset.
 */
export const Footer = component(
  'footer',
  $((props: { todos: Todos }) => {
    return onRender$(() => {
      console.log('on:qRender => <Footer/>');
      /**
       * Example of lite-component (it will always be included with the parent component)
       */
      function Filter({ filter }: { filter: FilterStates }) {
        const lMode = filter.toLowerCase();
        return (
          <li>
            <a
              class={{ selected: props.todos.filter == lMode }}
              on$:click={() => updateFilter(props.todos, filter)}
            >
              {filter[0].toUpperCase() + filter.substr(1)}
            </a>
          </li>
        );
      }
      const remaining = getFilteredCount(props.todos);
      return (
        <Host class="footer">
          {props.todos.items.length > 0 ? (
            <>
              <span class="todo-count">
                <strong>{remaining}</strong>
                {remaining == 1 ? ' item' : ' items'} left
              </span>
              <ul class="filters">
                {FilterStates.map((f) => (
                  <Filter filter={f} />
                ))}
              </ul>
              {remaining > 0 ? (
                <button class="clear-completed" on$:click={() => clearCompleted(props.todos)}>
                  Clear completed
                </button>
              ) : null}
            </>
          ) : null}
        </Host>
      );
    });
  })
);
