import { component$ } from '@qwik.dev/core';

export const HelloWorld = component$(({ onClick }: any) => {
  return <button onClick$={onClick}></button>;
});
