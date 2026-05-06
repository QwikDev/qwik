import { component$, useTask$ } from '@qwik.dev/core';
export const HelloWorld = component$(() => {
  function getValue(): number | string | null | undefined | { prop: string } {
    return (window as any).aaa;
  }
  const a = getValue();
  useTask$(() => {
    // eslint-disable-next-line no-console
    console.log(a);
  });
  return <div></div>;
});
