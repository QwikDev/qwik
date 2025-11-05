import { routeLoader$, server$ } from "@qwik.dev/router";
import {
  Resource,
  component$,
  useResource$,
  useSignal,
  useTask$,
} from "@qwik.dev/core";
import { delay } from "../actions/login";

export const useGetUserAgent = routeLoader$(() => {
  return getUserAgent();
});

export const getUserAgentForReal = server$(function () {
  if (!this) {
    return "failed";
  }
  const header = this.request.headers.get("host")!;
  return header;
});

export const getUserAgent = server$(function () {
  return getUserAgentForReal();
});

export const streamingFunc = server$(async function* () {
  for (let i = 0; i < 5; i++) {
    await delay(1000);
    yield i;
  }
});

const serverFunctionA = server$(async function a() {
  return this.method;
});
const serverFunctionB = server$(async function b() {
  return this.method;
});

const argsChecker = server$(async function (...args: any[]) {
  return args.map(String).join(",");
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
  const resource = useResource$(() => getUserAgent());
  const userAgent = useSignal("");
  const userAgentEvent = useSignal("");
  const loader = useGetUserAgent();
  const streamingLogs = useSignal("");
  const serverArgsReceived = useSignal("");
  const clientArgsReceived = useSignal("");
  const localCount = useSignal(0);
  const receivedCount = useSignal(0);

  const scopeGetter = server$(() => {
    return localCount.value;
  });

  useTask$(async () => {
    serverArgsReceived.value = await argsChecker(1, 1, 1);
  });

  useTask$(async () => {
    userAgent.value = await getUserAgent();
  });
  return (
    <>
      <Resource
        value={resource}
        onResolved={(value) => <div class="server-host">{value}</div>}
      />
      <div class="server-host">{userAgent.value}</div>
      <div class="server-host">{userAgent.value}</div>
      <div class="server-host">{loader.value}</div>
      <div class="server-host">{userAgentEvent.value}</div>
      <button
        id="server-host-button"
        onClick$={async () => {
          userAgentEvent.value = await getUserAgent();
        }}
      >
        Load
      </button>
      <section>
        <h2>Streaming</h2>

        <div class="server-streaming">{streamingLogs.value}</div>

        <button
          id="server-streaming-button"
          onClick$={async () => {
            for await (const nu of await streamingFunc()) {
              streamingLogs.value += nu;
            }
          }}
        >
          5 seconds streaming
        </button>
      </section>
      <MultipleServerFunctionsInvokedInTask />
      <button
        id="args-checker-button"
        onClick$={async () => {
          clientArgsReceived.value = await argsChecker(10, 10);
        }}
      >
        Count Args: {serverArgsReceived.value} / {clientArgsReceived.value}
      </button>
      <button
        id="scope-checker-button"
        onClick$={async () => {
          localCount.value++;
          receivedCount.value = await scopeGetter();
        }}
      >
        local/remote: {localCount.value} / {receivedCount.value}
      </button>
    </>
  );
});
