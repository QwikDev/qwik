import { component$, useTask$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const getMethod = () => {
    return Promise.resolve();
  };
  const useMethod = getMethod();
  const obj = {
    stuff: 12,
    b: false,
    n: null,
    date: new Date(),
    url: new URL('http://localhost:8080/'),
    regex: new RegExp('dfdf'),
    u: undefined,
    manu: 'string',
    complex: {
      s: true,
    },
  };
  useTask$(() => {
    // eslint-disable-next-line no-console
    console.log(useMethod, obj);
  });
  return <div></div>;
});
