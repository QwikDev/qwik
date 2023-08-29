import { component$ } from "@builder.io/qwik";
import { FILTERS, FilterStates, Todos } from "../../state/state";

/**
 * Footer showing items remaining and filtering options
 *
 * It only rerenders if the todos count changes or filters are reset.
 */
export const Footer = component$((props: { todos: Todos }) => {
  /**
   * Example of lite-component (it will always be included with the parent component)
   */
  function Filter({ filter }: { filter: FilterStates }) {
    const lMode = filter.toLowerCase();
    return (
      <li>
        <a
          class={{ selected: props.todos.filter == lMode }}
          onClick$={() => {
            props.todos.filter = filter;
          }}
        >
          {filter[0].toUpperCase() + filter.slice(1)}
        </a>
      </li>
    );
  }
  const remaining = props.todos.items.filter(FILTERS.active).length;
  return (
    <footer class="footer">
      {props.todos.items.length > 0 ? (
        <>
          <span class="todo-count">
            <strong>{remaining}</strong>
            {remaining == 1 ? " item" : " items"} left
          </span>
          <ul class="filters">
            {FilterStates.map((f) => (
              <Filter filter={f} key={f} />
            ))}
          </ul>
          {remaining > 0 ? (
            <button
              class="clear-completed"
              onClick$={() => {
                props.todos.items = props.todos.items.filter(FILTERS.active);
              }}
            >
              Clear completed
            </button>
          ) : null}
        </>
      ) : null}
    </footer>
  );
});
