import type { DocumentHead } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  return (
    <div>
      <h1>Settings</h1>
      <p>My Settings</p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Settings",
};
