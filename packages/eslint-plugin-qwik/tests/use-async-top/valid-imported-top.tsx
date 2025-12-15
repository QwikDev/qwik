import { component$, useTask$ } from '@qwik.dev/core';
import { userData } from '../../test-fixtures/use-async-top/exported';

export default component$(() => {
  useTask$(() => {
    userData.value;
    const x = 1;
  });
  return <div />;
});
