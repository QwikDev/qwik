import { component$, useStyles$ } from '@qwikdev/core';

export default component$(() => {
  return (
    <>
      <ComponentA />
      <ComponentB />
    </>
  );
});

export const ComponentA = component$(() => {
  useStyles$(`
    .component {
      background-color: red;
    }`);
  return (
    <div class="component">
      <div>A</div>
    </div>
  );
});

export const ComponentB = component$(() => {
  useStyles$(`
    .component {
      background-color: green;
    }`);

  return (
    <div class="component">
      <div>B</div>
    </div>
  );
});
