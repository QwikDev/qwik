#![feature(test)]

extern crate test;

use qwik_core::*;
use test::Bencher;

#[bench]
fn transform_todo_app(b: &mut Bencher) {
    b.iter(|| {
      let code = r#"
      import {
          Fragment,
          Host,
          qComponent$,
          onRender$,
          useStore,
          useHostElement,
          useEvent,
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


        export const ToDoApp = qComponent$((props: { todos: Todos }) => {
          return onRender$(() => {
            console.log('on$:qRender => <ToDoApp/>');
            return (
              <section class="todoapp">
                <Header todos={props.todos} />
                <Main todos={props.todos} />
                <Footer todos={props.todos} />
              </section>
            );
          });
        });

        export const Header = qComponent$((props: { todos: Todos }) => {
          const state = useStore({ text: '' });
          return onRender$(() => {
            console.log('on$:qRender => <Header/>');
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
        });

        export const Main = qComponent$((props: { todos: Todos }) => {
          return onRender$(() => {
            console.log('on$:qRender => <Main/>');
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

        export const Item = qComponent$((props: { item: TodoItem; todos: Todos }) => {
          const state = useStore({ editing: false });
          return onRender$(() => {
            console.log(
              'on$:qRender => <Item item="' +
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
        });

        export const Footer = qComponent$((props: { todos: Todos }) => {
          return onRender$(() => {
            console.log('on$:qRender => <Footer/>');
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
        });
      "#;
      transform_modules(TransformModulesOptions {
          root_dir: "/user/qwik/src/".into(),
          input: vec![TransformModuleInput {
              code: code.into(),
              path: "file.tsx".into(),
          }],
          source_maps: false,
          explicity_extensions: false,
          minify: MinifyMode::Simplify,
          transpile: true,
          entry_strategy: EntryStrategy::Single,
      })
  });
}
