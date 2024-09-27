import type { DocumentHead } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

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
