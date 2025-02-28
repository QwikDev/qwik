import type { DocumentHead } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  return (
    <div>
      <h1>Profile</h1>
      <p>My Profile</p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Profile",
};
