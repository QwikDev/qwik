import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <>
      <h1>Hi 👋</h1>
      <div>
        Can't wait to see what you build with qwik!
        <br />
        Happy coding.
      </div>
      <nav style={{ marginTop: "2rem" }}>
        <ul>
          <li>
            <a href="/users/">Show all users</a>
          </li>
          <li>
            <a href="/create">Create user</a>
          </li>
        </ul>
      </nav>
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
