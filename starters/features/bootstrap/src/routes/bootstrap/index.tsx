import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <>
      <h2>Bootstrap components</h2>
      <hr />
      <ul>
        <li>
          <Link href="/bootstrap/alerts/">Alerts</Link>
        </li>
        <li>
          <Link href="/bootstrap/buttons/">Buttons</Link>
        </li>
        <li>
          <Link href="/bootstrap/spinners/">Spinners</Link>
        </li>
      </ul>
    </>
  );
});

export const head: DocumentHead = {
  title: "Welcome to Qwik",
  meta: [
    {
      name: "description",
      content: "Qwik site description",
    },
  ],
};
