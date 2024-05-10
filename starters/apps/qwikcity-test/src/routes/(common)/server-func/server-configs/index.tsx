import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import { delay } from "../../actions/login";

const customHeader = "x-custom-header";

export const serverFunctionA = server$(
  async function a() {
    return (
      this.method +
      "--" +
      (this.request.headers.get("X-Custom-Header") || "N/A")
    );
  },
  {
    headers: {
      [customHeader]: "MyCustomValue",
    },
  },
);
export const serverFunctionB = server$(
  async function b(this) {
    return (
      this.method + "--" + this.request.headers.get("x-custom-header") || "N/A"
    );
  },
  {
    method: "get",
    headers: {
      [customHeader]: "MyCustomValue",
    },
  },
);

export const MultipleServerFunctionsWithConfig = component$(() => {
  const serverValA = useSignal("");
  const serverValB = useSignal("");

  // ensure request made on client
  useVisibleTask$(async () => {
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
      server$
      <MultipleServerFunctionsWithConfig />
    </>
  );
});
