import {
  Fragment,
  h,
  Host,
  qComponent,
  qHook,
  useHostElement,
  useEvent,
  notifyRender,
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

// TODO(misko): APIs for better debugger experience: qProps
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
export const ToDoApp = qComponent<{ todos: Todos }>({
  tagName: 'todo', // optional
  onRender: qHook(({ todos }) => {
    console.log('on:qRender => <ToDoApp/>');
    return (
      <section class="todoapp">
        <Header todos={todos} />
        <Main todos={todos} />
        <Footer todos={todos} />
      </section>
    );
  }),
});

/**
 * Header component which is responsible for providing UI to ender new todo item.
 *
 * This component only rerenders if the user interacts with it through the input.
 */
export const Header = qComponent<{ todos: Todos }, { text: string }>({
  tagName: 'header', // optional
  onMount: qHook(() => ({ text: '' })),
  onRender: qHook((_, { text }) => {
    console.log('on:qRender => <Header/>');
    return (
      <>
        <h1>todos</h1>
        <input
          class="new-todo"
          placeholder="What needs to be done?"
          autoFocus
          value={text}
          on:keyup={qHook<typeof Header>(({ todos }, state) => {
            const event = useEvent<KeyboardEvent>();
            const inputValue = (event.target as HTMLInputElement).value;
            state.text = inputValue;
            if (event.key === 'Enter' && inputValue) {
              addItem(todos, state.text);
              state.text = '';
            }
          })}
        />
      </>
    );
  }),
});

/**
 * Main body of the application which contains the list of todo items.
 *
 * This component only rerenders/hydrates/downloads if the list of todos changes.
 */
export const Main = qComponent<{ todos: Todos }>({
  tagName: 'main', // optional
  onRender: qHook(({ todos }) => {
    console.log('on:qRender => <Main/>');
    return (
      <Host class="main">
        <ul class="todo-list">
          {getFilteredItems(todos).map((key) => (
            <Item item={key} todos={todos} />
          ))}
        </ul>
      </Host>
    );
  }),
});

/**
 * Individual items of the component.
 *
 * It only rerenders if the user infarcts with it or if the item itself changes.
 */
export const Item = qComponent<{ item: TodoItem; todos: Todos }, { editing: boolean }>({
  tagName: 'li', // optional
  onMount: qHook(() => ({ editing: false })),
  onRender: qHook(({ item }, { editing }) => {
    console.log(
      'on:qRender => <Item item="' +
        JSON.stringify(item, (key, value) => (key.startsWith('__') ? undefined : value)) +
        '"/>'
    );
    return (
      <Host class={{ completed: item.completed, editing: editing }}>
        <div class="view">
          <input
            class="toggle"
            type="checkbox"
            checked={item.completed}
            on:click={qHook<typeof Item>(({ item, todos }) => toggleItem(todos, item))}
          />
          <label
            on:dblclick={qHook<typeof Item>(async (props, state) => {
              state.editing = true;
              const hostElement = useHostElement()!;
              await notifyRender(hostElement);
              const inputEl = hostElement.querySelector('input.edit') as HTMLInputElement;
              inputEl.focus();
              inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
            })}
          >
            {item.title}
          </label>
          <button
            class="destroy"
            on:click={qHook<typeof Item>(({ item, todos }) => removeItem(todos, item))}
          ></button>
        </div>
        {editing ? (
          <input
            class="edit"
            value={item.title}
            on:blur={qHook<typeof Item>((_, state) => (state.editing = false))}
            on:keyup={qHook<typeof Item>(({ item }, state) => {
              const event = useEvent<KeyboardEvent>();
              const inputValue = (event.target as HTMLInputElement).value;
              item.title = inputValue;
              if (event.key === 'Enter') {
                state.editing = false;
              }
            })}
          />
        ) : null}
      </Host>
    );
  }),
});

/**
 * Footer showing items remaining and filtering options
 *
 * It only rerenders if the todos count changes or filters are reset.
 */
export const Footer = qComponent<{ todos: Todos }>({
  tagName: 'footer', // optional
  onRender: qHook(({ todos }) => {
    console.log('on:qRender => <Footer/>');
    /**
     * Example of lite-component (it will always be included with the parent component)
     */
    function Filter({ filter }: { filter: FilterStates }) {
      const lMode = filter.toLowerCase();
      return (
        <li>
          <a
            class={{ selected: todos.filter == lMode }}
            on:click={qHook<typeof Footer, { filter: FilterStates }>((props, _, { filter }) =>
              updateFilter(props.todos, filter)
            ).with({ filter })}
          >
            {filter[0].toUpperCase() + filter.substr(1)}
          </a>
        </li>
      );
    }
    const remaining = getFilteredCount(todos);
    return (
      <Host class="footer">
        {todos.items.length > 0 ? (
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
              <button
                class="clear-completed"
                on:click={qHook<typeof Footer>(({ todos }) => clearCompleted(todos))}
              >
                Clear completed
              </button>
            ) : null}
          </>
        ) : null}
      </Host>
    );
  }),
});
