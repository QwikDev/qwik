import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { delay } from "../../actions/login";

const customHeader = "X-Custom-Header";

const serverFunctionA = server$(
  async function a() {
    return (
      this.method +
      "-" +
      (this.request.headers.get("x-custom-header") ||
        this.request.headers.get(customHeader) ||
        "N/A")
    );
  },
  {
    method: "get",
    headers: {
      [customHeader]: "MyCustomValue",
    },
  },
);

const serverFunctionB = server$(
  async function b() {
    return this.headers.get(customHeader) || "N/A";
  },
  {
    headers: {
      [customHeader]: "MyCustomValue",
    },
  },
);

export const MultipleServerFunctionsWithConfig = component$(() => {
  const serverValA = useSignal("");
  const serverValB = useSignal("");

  useTask$(async () => {
    serverValA.value = await serverFunctionA();
    await delay(1);
    serverValB.value = await serverFunctionB();
  });

  return (
    <div id="server-configs">
      {serverValA.value}-{serverValB.value}
    </div>
  );
});

export default component$(() => {
  return (
    <>
      <MultipleServerFunctionsWithConfig />
    </>
  );
});
