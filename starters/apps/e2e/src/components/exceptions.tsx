import { component$, useTask$ } from "@qwikdev/core";

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
