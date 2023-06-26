import {
  Resource,
  component$,
  useComputed$,
  useResource$,
  useSignal,
  useTask$,
} from "@builder.io/qwik";
import { routeLoader$, server$ } from "@builder.io/qwik-city";

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

export default component$(() => {
  const resource = useResource$(() => getUserAgent());
  const userAgent = useSignal("");
  const userAgentEvent = useSignal("");
  const userAgentComputed = useComputed$(() => getUserAgent());
  const loader = useGetUserAgent();
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
    </>
  );
});
