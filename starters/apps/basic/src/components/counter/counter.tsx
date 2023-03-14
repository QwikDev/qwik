import { component$, useSignal, useStylesScoped$ } from '@builder.io/qwik';
import styles from './counter.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  const count = useSignal(10);

  return (
    <div class="counter-wrapper">
      <button onClick$={() => count.value--}>-</button>
      <span class={`counter-value ${count.value % 2 === 0 ? 'odd' : ''}`}>{count.value}</span>
      <button onClick$={() => count.value++}>+</button>
    </div>
  );
});
