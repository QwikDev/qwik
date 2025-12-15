import { component$ } from '@qwik.dev/core';
import { routeLoader$, type LoaderSignal } from '@qwik.dev/router';

export const useProductDetails = routeLoader$(async (requestEvent) => {
  return 'abc';
});

export default component$(() => {
  const signal = useProductDetails();
  const x = 0;
  // Expect error: { "messageId": "asyncComputedNotTop" }
  signal.value;
  return <p>Product name: {signal.value}</p>;
});

const useCustom = async (signal: LoaderSignal<string>) => {
  const x = 0;
  // Expect error: { "messageId": "asyncComputedNotTop" }
  return signal.value;
};

export const Test3 = component$(() => {
  const signal = useProductDetails();
  const x = useCustom(signal);
  return <p>Product name: {x}</p>;
});
