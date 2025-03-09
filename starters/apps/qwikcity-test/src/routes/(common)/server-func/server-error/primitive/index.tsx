import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";

const serverFunctionA = server$(async () => {
  throw new ServerError(401, 1);
});

const serverFunctionB = server$(async () => {
  throw new ServerError(500, "error");
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
