import type { DocumentHead } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

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
