import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useTest = routeLoader$(async () => {
  // eslint-disable-next-line @typescript-eslint/await-thenable
  return await 42;
});

export default component$(() => {
  const loaded = useTest();

  return (
    <>
      <h1>Sub page</h1>
      <p>This is the sub page.</p>
      <p id="subpage-loader-value">{loaded.value}</p>
    </>
  );
});
