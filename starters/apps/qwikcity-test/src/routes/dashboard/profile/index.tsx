import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

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
