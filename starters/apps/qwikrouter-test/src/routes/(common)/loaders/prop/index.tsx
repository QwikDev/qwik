import { component$, type Signal } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";

export const useTestLoader = routeLoader$(async () => {
  return { test: "test" };
});

export default component$(() => {
  const testSignal = useTestLoader();
  return <Homepage testSignal={testSignal} />;
});

export const Homepage = component$(
  (props: { testSignal: Signal<{ test: string }> }) => {
    return <div id="prop">{props.testSignal.value.test}</div>;
  },
);
