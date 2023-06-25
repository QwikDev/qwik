import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

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
