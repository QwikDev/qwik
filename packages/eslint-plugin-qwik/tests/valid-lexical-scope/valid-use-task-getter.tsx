import { component$, useTask$ } from '@builder.io/qwik';
export const HelloWorld = component$(() => {
  function getValue(): number | string | null | undefined | { prop: string } {
    return (window as any).aaa;
  }
  const a = getValue();
  useTask$(() => {
    /*   eslint no-console: [, { allow: ["log"] }] */
    console.log(a);
  });
  return <div></div>;
});
