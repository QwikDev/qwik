import { component$ } from '@qwikdev/core';

export const HelloWorld = component$(({ onClick }: any) => {
  return <button onClick$={onClick}></button>;
});
