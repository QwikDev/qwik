import { component$, useTask$ } from '@qwik.dev/core';
import { userData } from '../../test-fixtures/use-async-top/exported';

export default component$(() => {
  useTask$(() => {
    const y = 0;
    // Expect error: {"messageId":"asyncComputedNotTop"}
    userData.value;
  });
  return <div />;
});
