import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const serverFunctionA = server$(async function a() {
  const user = await this.cookie.get("user")?.value;
  await this.cookie.set("x-key", `PatrickJS-${user}`);
});
const serverFunctionB = server$(async function a() {
  return (await this.cookie.get("x-key")?.value) || "";
});

export const MultipleServerFunctionsInvokedInTask = component$(() => {
  const serverVal = useSignal("");
  useTask$(async function () {
    await serverFunctionA();
    serverVal.value = await serverFunctionB();
  });

  return (
    <>
      <div id="server-cookie">{serverVal.value}</div>
    </>
  );
});

export default component$(() => {
  return (
    <>
      <MultipleServerFunctionsInvokedInTask />
    </>
  );
});
