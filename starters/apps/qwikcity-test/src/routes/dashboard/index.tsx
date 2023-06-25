import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        <a href="/qwikcity-test/sign-out/">Sign Out</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Home",
};
