import { server$ } from "@qwik.dev/router";
import { component$, useSignal, useTask$ } from "@qwik.dev/core";
import { delay } from "../../actions/login";

const serverFunctionA = server$(async function a() {
  return this.method;
});
const serverFunctionB = server$(async function b() {
  return this.method;
});

export const MultipleServerFunctionsInvokedInTask = component$(() => {
  const methodA = useSignal("");
  const methodB = useSignal("");
  useTask$(async () => {
    methodA.value = await serverFunctionA();
    await delay(1);
    methodB.value = await serverFunctionB();
  });

  return (
    <div id="methods">
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
