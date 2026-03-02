import {
  component$,
  useTask$,
  useVisibleTask$,
  useSignal,
  $,
  useStyles$,
} from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";

// This will be in a separate chunk due to dynamic import
const getLibA = () => import("../vendor-lib/libA");
const getLibB = () => import("../vendor-lib/libB");

export default component$(() => {
  useStyles$(`
    .home-container {
      max-width: 42rem;
      margin: 0 auto;
    }

    .title {
      font-size: 1.875rem;
      font-weight: bold;
      margin-bottom: 1rem;
    }

    .paragraph {
      margin-bottom: 1rem;
    }
  `);

  const count = useSignal(0);
  const message = useSignal("");

  useVisibleTask$(async ({ track }) => {
    const lib = track(count) & 1 ? getLibA() : getLibB();
    message.value = (await lib).getMessage();
  });

  useTask$(async () => {
    message.value = "loading...";
  });

  const handleClick$ = $(async () => {
    count.value++;
    const lib = await (count.value & 1 ? getLibA() : getLibB());
    message.value = lib.getMessage();
  });

  return (
    <div class="home-container">
      <h1 class="title">Welcome to Preloader Test</h1>
      <p class="paragraph">
        This is a test application to demonstrate preloading capabilities in
        Qwik.
      </p>
      <p class="paragraph">
        Navigate to the Form page to try out the form functionality, or visit
        the About page to learn more.
      </p>
      <p>Count: {count.value}</p>
      <p>Message: {message.value}</p>
      {/* event handler with $ */}
      <button onClick$={handleClick$}>Increment</button>
      {/* inline event handler */}
      <button onClick$={() => count.value--}>Decrement</button>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Home - Preloader Test",
  meta: [
    {
      name: "description",
      content: "Welcome to the Preloader Test application",
    },
  ],
};
