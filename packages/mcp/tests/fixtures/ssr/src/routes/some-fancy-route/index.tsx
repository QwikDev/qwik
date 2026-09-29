import { component$ } from '@qwik.dev/core';

const SomeInternalCmp = component$(() => {
  return <div>I am an internal component!</div>;
});

export default component$(() => {
  return (
    <>
      <h1>Hi, fancy route here</h1>
      <SomeInternalCmp />
    </>
  );
});
