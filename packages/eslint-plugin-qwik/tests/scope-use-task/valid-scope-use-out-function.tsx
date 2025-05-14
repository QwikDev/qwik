import { component$, useTask$, isServer } from '@qwik.dev/core';
function foo() {
  if (isServer) {
    process.env;
  }
}
export default component$(() => {
  useTask$(() => {
    foo();
  });
  return <></>;
});
