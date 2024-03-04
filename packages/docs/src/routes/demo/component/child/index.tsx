import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <>
      <p>Parent Text</p>
      <Child />
    </>
  );
});

const Child = component$(() => {
  return <p>Child Text</p>;
});
