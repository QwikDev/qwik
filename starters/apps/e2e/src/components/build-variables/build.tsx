import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import { isBrowser, isServer } from "@builder.io/qwik";
import * as build from "@builder.io/qwik";

export const BuildVariables = component$(() => {
  const json = useSignal("");
  const count = useSignal(0);

  useTask$(({ track }) => {
    track(() => count.value);
    json.value = JSON.stringify({
      isServer: isServer,
      isBrowser: isBrowser,
      isDev: build.isDev,
      buildIsServer: build.isServer,
      buildIsBrowser: build.isBrowser,
      buildIsDev: build.isDev,
      count: count.value,
    });
  });

  return (
    <>
      <button id="build-variables-button" onClick$={() => count.value++}>
        Redo
      </button>
      <div id="build-variables-result">{json.value}</div>
    </>
  );
});
