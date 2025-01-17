import { component$, useTask$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const getMethod = () => {
    return 'value';
  };
  const useMethod = getMethod();
  useTask$(() => {
    /* eslint no-console: [, { allow: ["log"] }] */
    console.log(useMethod);
  });
  return <div></div>;
});
