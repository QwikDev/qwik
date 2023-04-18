import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <main>
      Insert Greeter component here. By composing components together large applications can be
      written without putting all of the code into a single file/component.
    </main>
  );
});

export const Greeter = component$(() => {
  return <div>Hello World!</div>;
});
