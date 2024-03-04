import {
  Resource,
  component$,
  useComputed$,
  useResource$,
  useSignal,
  useTask$,
} from "@builder.io/qwik";
import { routeLoader$, server$ } from "@builder.io/qwik-city";
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
  const userAgentComputed = useComputed$(() => getUserAgent());
  const loader = useGetUserAgent();
  const streamingLogs = useSignal("");

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
      <div class="server-host">{userAgentComputed.value}</div>
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
    </>
  );
});
