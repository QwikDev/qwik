import type { DocumentHead } from "@qwikdev/city";
import { component$ } from "@qwikdev/core";

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
