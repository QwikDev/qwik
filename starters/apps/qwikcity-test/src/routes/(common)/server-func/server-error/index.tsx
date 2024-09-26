import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";
import { delay } from "../../actions/login";

type ResponseTuple = [null | string, string];

const serverFunctionA = server$(async function a(): Promise<ResponseTuple> {
  throw new ServerError<[string]>(401, ["my error"]);
});

const serverFunctionB = server$(async function b(): Promise<ResponseTuple> {
  return [null, this.method || ""];
});

export const MultipleServerFunctionsInvokedInTask = component$(() => {
  const methodA = useSignal("");
  const methodB = useSignal("");

  useVisibleTask$(async () => {
    const [error /*, data */] = await serverFunctionA();
    if (error) {
      methodA.value = error;
    }
    await delay(1);
    //     err, method
    const [, method] = await serverFunctionB();
    methodB.value = method;
  });

  return (
    <div id="server-error">
      <b>(</b>
      {methodA.value}
      {methodB.value}
      <b>)</b>
    </div>
  );
});

export default component$(() => {
  return (
    <>
      <MultipleServerFunctionsInvokedInTask />
    </>
  );
});
