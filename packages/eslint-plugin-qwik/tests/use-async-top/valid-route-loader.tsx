import { component$ } from '@qwik.dev/core';
import { routeLoader$, type LoaderSignal } from '@qwik.dev/router';

export const useProductDetails = routeLoader$(async (requestEvent) => {
  return 'abc';
});

export default component$(() => {
  const signal = useProductDetails();
  return <p>Product name: {signal.value}</p>;
});

export const useCustom = (signal: any) => {
  signal.value;
  const x = 0;
};

export const Test2 = component$(() => {
  const signal = useProductDetails();
  useCustom(signal);
  return <p>Product name: {signal.value}</p>;
});

const useCustom2 = async (signal: LoaderSignal<string>) => {
  await signal.promise();
  const x = 0;
  return signal.value;
};

export const Test3 = component$(() => {
  const signal = useProductDetails();
  const x = useCustom2(signal);
  return <p>Product name: {x}</p>;
});
