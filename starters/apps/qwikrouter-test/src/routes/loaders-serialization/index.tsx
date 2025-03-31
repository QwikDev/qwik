import { component$, useSignal } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";

export const useTestLoader = routeLoader$(async () => {
  return { test: "some test value", abcd: "should not serialize this" };
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
  return (
    <>
      <div id="prop1">{testSignal.value.test}</div>
      <div id="prop2">{testSignal.value.abcd}</div>
    </>
  );
});
