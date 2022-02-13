import { component$, Host, $ } from '@builder.io/qwik';
import {
  clearCompleted,
  FilterStates,
  getFilteredCount,
  Todos,
  updateFilter,
} from '../../state/state';

/**
 * Footer showing items remaining and filtering options
 *
 * It only rerenders if the todos count changes or filters are reset.
 */
export const Footer = component$(
  (props: { todos: Todos }) => {
    return $(() => {
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
  },
  {
    tagName: 'footer',
  }
);
