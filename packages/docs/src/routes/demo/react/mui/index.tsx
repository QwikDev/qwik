import { component$, useSignal } from '@builder.io/qwik';
import { Example } from './react';

export default component$(() => {
  console.log('Qwik Render');
  const selected = useSignal(0);
  return (
    <Example
      selected={selected.value}
      onSelected$={(v) => (selected.value = v)}
    >
      Selected tab: {selected.value}
    </Example>
  );
});
