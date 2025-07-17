import { component$, useSignal } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";

export const useTestLoader = routeLoader$(() => {
  return { test: "some test value", abcd: "should not serialize this" };
});

export const useTestLoaderEager = routeLoader$(
  () => {
    return { foo: "some eager test value", bar: "should serialize this" };
  },
  { serializationStrategy: "always" },
);

export const useNestedLoader = routeLoader$(async (requestEv) => {
  const testData = await requestEv.resolveValue(useTestLoader);
  return { test: testData.test + " nested", abcd: testData.abcd + " nested" };
});

export default component$(() => {
  const testSignal = useTestLoader();
  const toggle = useSignal(false);
  return (
    <>
      {testSignal.value.test}
      <button id="toggle-child" onClick$={() => (toggle.value = !toggle.value)}>
        toggle child
      </button>
      {toggle.value && <Child />}
      {toggle.value && <ChildEager />}
      {toggle.value && <NestedChild />}
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

export const ChildEager = component$(() => {
  const testSignal = useTestLoaderEager();
  return (
    <>
      <div id="prop3">{testSignal.value.foo}</div>
      <div id="prop4">{testSignal.value.bar}</div>
    </>
  );
});

export const NestedChild = component$(() => {
  const testSignal = useNestedLoader();
  return (
    <>
      <div id="prop5">{testSignal.value.test}</div>
      <div id="prop6">{testSignal.value.abcd}</div>
    </>
  );
});
