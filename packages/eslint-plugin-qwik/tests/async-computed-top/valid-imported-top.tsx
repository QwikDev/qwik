import { component$, useTask$ } from '@qwik.dev/core';
import { userData } from '../../test-fixtures/async-computed/exported';

export default component$(() => {
  useTask$(() => {
    userData.value;
    const x = 1;
  });
  return <div />;
});
