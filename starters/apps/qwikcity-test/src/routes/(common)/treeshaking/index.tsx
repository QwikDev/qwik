import { component$, useSignal } from '@builder.io/qwik';
import { loader$ } from '@builder.io/qwik-city';

export const neverUsed = loader$(() => {
  // console.log('neverUsed');
  return ['SHOULD NOT BE SERIALIZED'];
});

export const used = loader$(() => {
  // console.log('used');

  return ['USED, but not serialized'];
});

export default component$(() => {
  const data = used.use();
  const signal = useSignal(0);

  return (
    <div class="actions">
      <button onClick$={() => signal.value++}>{signal.value}</button>
      {data.value.map((item) => (
        <div>{item}</div>
      ))}
    </div>
  );
});
