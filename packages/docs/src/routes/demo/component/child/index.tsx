import { component$ } from '@qwikdev/core';

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
