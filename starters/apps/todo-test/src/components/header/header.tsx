import { component$, useContext, useStore } from "@builder.io/qwik";
import { TODOS } from "../../state/state";

/**
 * Header component which is responsible for providing UI to ender new todo item.
 *
 * This component only rerenders if the user interacts with it through the input.
 */
export const Header = component$(() => {
  const state = useStore({ text: "" });
  const todos = useContext(TODOS);
  return (
    <header>
      <h1>todos</h1>
      <input
        class="new-todo"
        placeholder="What needs to be done?"
        autoFocus
        value={state.text}
        onKeyUp$={(event: any) => {
          const inputValue = (event.target as HTMLInputElement).value;
          state.text = inputValue;
          if (event.key === "Enter" && inputValue) {
            todos.items.push({
              completed: false,
              title: state.text,
              id: `${todos.nextItemId++}`,
            });
            state.text = "";
          }
        }}
      />
    </header>
  );
});
