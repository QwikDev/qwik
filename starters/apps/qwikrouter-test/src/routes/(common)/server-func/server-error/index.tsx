import { server$ } from "@qwik.dev/router";
import { ServerError } from "@qwik.dev/router/middleware/request-handler";
import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { delay } from "../../actions/login";

type ErrorReason = {
  reason: string;
  middleware: string;
};

const serverFunctionA = server$(async function a(): Promise<string> {
  throw new ServerError<ErrorReason>(401, {
    reason: "my error",
    middleware: "server-error-uncaught",
  });
});

const serverFunctionB = server$(async function b(): Promise<string> {
  return this.method;
});

export const MultipleServerFunctionsInvokedInTask = component$(() => {
  const errorReason = useSignal("");
  const errorMiddleware = useSignal("");
  const methodB = useSignal("");

  useVisibleTask$(async () => {
    try {
      await serverFunctionA();
    } catch (err: any) {
      if (isErrorReason(err)) {
        errorReason.value = err.reason;
        errorMiddleware.value = err.middleware;
      }
    }

    await delay(1);

    const method = await serverFunctionB();
    methodB.value = method;
  });

  return (
    <div id="server-error">
      <b>(</b>
      {errorReason.value}
      {errorMiddleware.value}
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

export function isErrorReason(err: any): err is ErrorReason {
  if (typeof err.reason === "string" && typeof err.middleware === "string") {
    return true;
  }

  return false;
}
