import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <h1>Welcome to the Docs!</h1>

      <p>
        <a href="/qwikrouter-test/docs">
          Docs link with trailing slash (should redirect without slash)
        </a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Welcome!",
};
