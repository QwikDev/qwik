import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";
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
      {errorReason.value}
      {errorMiddleware.value}
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

export function isErrorReason(err: any): err is ErrorReason {
  if (typeof err.reason === "string" && typeof err.middleware === "string") {
    return true;
  }

  return false;
}
