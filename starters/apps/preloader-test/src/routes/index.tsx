/* eslint-disable no-console */
import {
  component$,
  useTask$,
  useVisibleTask$,
  useSignal,
  $,
  useStyles$,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import * as libA from "../vendor-lib/libA";
import * as libB from "../vendor-lib/libB";
// This will be in a separate chunk due to dynamic import
const getLibA = $(() => libA);
const getLibB = $(() => libB);

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

  const getMessage = $(async () => {
    const lib = count.value & 1 ? await getLibA() : await getLibB();
    return lib.getMessage();
  });

  useVisibleTask$(async ({ track }) => {
    message.value = "loading...";

    track(() => count.value);
    message.value = await getMessage();
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
      <button onClick$={() => count.value++}>Increment</button>
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
