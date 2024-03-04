import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { delay } from "../../actions/login";

const serverHost = server$(function () {
  return this.request.headers.get("host")!;
});
const serverFunctionA = server$(async function a() {
  const user = (await this.cookie.get("user")?.value) || "";
  return user;
});
const serverFunctionB = server$(async function b() {
  const user = (await this.cookie.get("user")?.value) || "";
  return user;
});

export const MultipleServerFunctionsInvokedInTask = component$(() => {
  const host = useSignal("");
  const user1 = useSignal("");
  const user2 = useSignal("");
  useTask$(async () => {
    host.value = await serverHost();
    await delay(1);
    user1.value = await serverFunctionA();
    await delay(1);
    user2.value = await serverFunctionB();
  });

  return (
    <>
      <div id="host">{host.value}</div>
      <div id="users">
        {user1.value}
        {user2.value}
      </div>
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
