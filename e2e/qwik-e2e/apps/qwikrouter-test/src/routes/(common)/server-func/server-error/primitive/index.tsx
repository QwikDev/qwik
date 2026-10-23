import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

const serverFunctionA = server$(async () => {
  throw new HttpError(401, 1);
});

const serverFunctionB = server$(async () => {
  throw new HttpError(500, 'error');
});

export default component$(() => {
  const errorA = useSignal<number>();
  const errorB = useSignal<string>();

  useVisibleTask$(async () => {
    try {
      await serverFunctionA();
    } catch (err: any) {
      errorA.value = err;
    }

    try {
      await serverFunctionB();
    } catch (err: any) {
      errorB.value = err;
    }
  });

  return (
    <div id="server-error">
      {errorA.value}
      {errorB.value}
    </div>
  );
});
