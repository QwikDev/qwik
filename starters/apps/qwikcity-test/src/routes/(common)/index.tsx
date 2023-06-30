import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
// @ts-ignore
import ImageJpeg from "../../media/test.jpeg?jsx";
// @ts-ignore
import ImageSvg from "../../media/qwik-logo.svg?jsx";

export default component$(() => {
  return (
    <div>
      <h1 onClick$={() => console.warn("hola")}>Welcome to Qwik City</h1>
      <p>The meta-framework for Qwik.</p>
      <ImageJpeg />
      <ImageSvg />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Welcome to Qwik City",
};
