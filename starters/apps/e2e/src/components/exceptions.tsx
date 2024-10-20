import { component$, useTask$ } from "@builder.io/qwik";

export const RenderExceptions = component$(() => {
  throw new Error("This is a render error");
});

export const UseTaskExceptions = component$(() => {
  useTask$(() => {
    throw new Error("This is a useTask$ error");
  });
  return (
    <div>
      <h1>Exceptions</h1>
    </div>
  );
});
