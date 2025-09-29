import { component$ } from "@builder.io/qwik";
import Dynamic2 from "./dynamic2";

export default component$(() => {
  return (
    <>
      <p>Dynamic 1</p>
      <Dynamic2 />
    </>
  );
});
