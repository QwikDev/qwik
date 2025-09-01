import { component$, useTask$ } from '@qwik.dev/core';
import { userData } from '../../test-fixtures/async-computed/exported';

export default component$(() => {
  useTask$(async () => {
    await userData.resolve();
    const z = 1;
    userData.value;
  });
  return <div />;
});
