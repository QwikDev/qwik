import { component$, useSignal } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";

export const useTestLoader = routeLoader$(async () => {
  return { test: "test" };
});

export default component$(() => {
  const testSignal = useTestLoader();
  const toggle = useSignal(false);
  return (
    <>
      {testSignal.value.test}
      <button onClick$={() => (toggle.value = !toggle.value)}>
        toggle child
      </button>
      {toggle.value && <Child />}
    </>
  );
});

export const Child = component$(() => {
  const testSignal = useTestLoader();
  return <div id="prop">{testSignal.value.test}</div>;
});
