import { component$, useTask$ } from '@builder.io/qwik';
export const HelloWorld = component$(() => {
  async function getValue() {
    return 'ffg';
  }
  const a = getValue();
  return (
    <div
      onClick$={() => {
        console.log(a);
      }}
    ></div>
  );
});
