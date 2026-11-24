import {
  component$,
  Pending,
  Reveal,
  useComputed$,
  useSignal,
  type RevealOrder,
} from '@qwik.dev/core';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Card = component$((props: { name: string; ms: number }) => {
  const status = useComputed$(async () => {
    await wait(props.ms);
    return `loaded after ${props.ms}ms`;
  });

  return (
    <li>
      <b>{props.name}</b> {status.value}
    </li>
  );
});

const ORDERS: RevealOrder[] = ['parallel', 'sequential', 'reverse', 'together'];

// <Reveal> coordinates the <Pending> boundaries inside it, so cards don't pop in at random.
export default component$(() => {
  const order = useSignal<RevealOrder>('sequential');
  const run = useSignal(0);

  return (
    <main>
      <p>
        Reveal order:{' '}
        {ORDERS.map((value) => (
          <button
            key={value}
            aria-pressed={order.value === value}
            onClick$={() => {
              order.value = value;
              run.value++;
            }}
          >
            {value}
          </button>
        ))}
      </p>

      <ul key={run.value}>
        <Reveal order={order.value}>
          <Pending fallback$={() => <li>Loading A...</li>}>
            <Card name="A" ms={1500} />
          </Pending>
          <Pending fallback$={() => <li>Loading B...</li>}>
            <Card name="B" ms={500} />
          </Pending>
          <Pending fallback$={() => <li>Loading C...</li>}>
            <Card name="C" ms={1000} />
          </Pending>
        </Reveal>
      </ul>
    </main>
  );
});
