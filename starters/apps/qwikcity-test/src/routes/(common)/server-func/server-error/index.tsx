import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";
import { delay } from "../../actions/login";

type ErrorReason = { reason: string };

const serverFunctionA = server$(async function a(): Promise<string> {
  throw new ServerError<ErrorReason>(401, { reason: "my error" });
});

const serverFunctionB = server$(async function b(): Promise<string> {
  return this.method;
});

export const MultipleServerFunctionsInvokedInTask = component$(() => {
  const methodA = useSignal("");
  const methodB = useSignal("");

  useVisibleTask$(async () => {
    try {
      await serverFunctionA();
    } catch (err: any) {
      if (isErrorReason(err)) {
        methodA.value = err.reason;
      }
    }

    await delay(1);

    const method = await serverFunctionB();
    methodB.value = method;
  });

  return (
    <div id="server-error">
      {methodA.value}
      {methodB.value}
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

function isErrorReason(err: any): err is ErrorReason {
  if (typeof err.reason === "string") {
    return true;
  }

  return false;
}
