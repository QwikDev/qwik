import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { renderChart } from 'heavy-library';

export const App = component$(() => {
  const count = useSignal(0);
  useVisibleTask$(() => renderChart(count.value));
  return <div>{count.value}</div>;
});
