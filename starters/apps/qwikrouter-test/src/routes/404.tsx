import { type DocumentHead } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export default component$(() => {
  return (
    <div>
      <h1>Custom not found error</h1>
    </div>
  );
});

export const head: DocumentHead = ({ params }) => {
  return {
    title: `Page Not Found`,
  };
};
