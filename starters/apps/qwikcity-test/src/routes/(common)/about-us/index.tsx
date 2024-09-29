import type { DocumentHead } from "@qwik.dev/city";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  return (
    <div>
      <h1>About Us</h1>
      <p>
        <a href="/qwikcity-test/">Home</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "About Us",
};
