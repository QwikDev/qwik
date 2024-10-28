import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <h1>About Us</h1>
      <p>
        <a href="/qwikrouter-test/">Home</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "About Us",
};
