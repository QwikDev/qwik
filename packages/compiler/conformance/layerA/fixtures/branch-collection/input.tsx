import { useComputed$, useSignal, useTask$ } from '@qwik.dev/core';

export function App() {
  const items = useSignal(['alpha', 'beta']);
  const label = useSignal('idle');
  const total = useComputed$(() => items.value.length * 2);
  useTask$(() => {
    if (items.value.length === 0) {
      label.value = 'empty';
    }
  });
  return (
    <section title={label.value}>
      {items.value.length === 0 ? (
        <p>Empty</p>
      ) : (
        <ul>
          {items.value.map((item, index) => (
            <li key={item}>
              {index + 1}. {item.toUpperCase()}
            </li>
          ))}
        </ul>
      )}
      <footer>{total.value}</footer>
    </section>
  );
}
