import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        <a href="/qwikrouter-test/sign-out/">Sign Out</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Home",
};
