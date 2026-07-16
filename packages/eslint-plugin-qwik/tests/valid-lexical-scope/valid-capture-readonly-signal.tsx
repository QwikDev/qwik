import { component$, useComputed$, useSignal, useTask$, type Signal } from '@qwik.dev/core';

function useReadonlySignal(): Readonly<Signal<number>> {
  const sig = useSignal(0);
  return sig;
}

export default component$(() => {
  const readonlySig = useReadonlySignal();

  const doubled = useComputed$(() => readonlySig.value * 2);

  return <div>{doubled.value}</div>;
});
