import { component$, useContext } from "@builder.io/qwik";
import { FILTERS, TODOS } from "../../state/state";
import { Item } from "../item/item";

export const Body = component$(() => {
  const todos = useContext(TODOS);
  return (
    <div class="main">
      <ul class="todo-list">
        {todos.items.filter(FILTERS[todos.filter]).map((key) => (
          <Item item={key} key={key.id} />
        ))}
      </ul>
    </div>
  );
});
