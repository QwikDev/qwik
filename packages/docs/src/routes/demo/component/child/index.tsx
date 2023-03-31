import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <>
      <div>Parent Text</div>
      <Child />
    </>
  );
});

const Child = component$(() => {
  return <div>Child Text</div>;
});
