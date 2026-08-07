import { useSignal, useVisibleTask$ } from '@qwik.dev/core';

export function App() {
  const status = useSignal('waiting');
  useVisibleTask$(() => {
    status.value = 'seen';
  });
  return <div>hi</div>;
}
