import { component$, useStyles$, useStore } from "@builder.io/qwik";
import { Footer } from "../footer/footer";
import { Header } from "../header/header";
import { Body } from "../body/body";
import type { Todos } from "../../state/state";
import styles from "./index.css?inline";

/**
 * Overall application component.
 *
 * This component is static (meaning it will never change). Because of this
 * Qwik knows that it should never need to be rerendered, and its code will never
 * download to the client.
 */
export const App = component$(() => {
  useStyles$(styles);

  const todos = useStore<Todos>(
    {
      filter: "all",
      items: [
        { completed: false, title: "Read Qwik docs", id: "0" },
        { completed: false, title: "Build HelloWorld", id: "1" },
        { completed: false, title: "Profit", id: "2" },
      ],
      nextItemId: 3,
    },
    { deep: true },
  );
  return (
    <section class="todoapp">
      <Header todos={todos} />
      <Body todos={todos} />
      <Footer todos={todos} />
    </section>
  );
});
