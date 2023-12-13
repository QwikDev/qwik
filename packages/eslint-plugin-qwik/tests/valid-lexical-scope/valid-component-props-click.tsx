import { component$ } from '@builder.io/qwik';

export const HelloWorld = component$(({ onClick }: any) => {
  return <button onClick$={onClick}></button>;
});
