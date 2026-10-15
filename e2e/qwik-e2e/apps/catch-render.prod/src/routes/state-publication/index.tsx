import {
  Catch,
  Pending,
  component$,
  useSignal,
  useSerializer$,
  useStyles,
  sync$,
  type Signal,
} from '@qwik.dev/core';

const Throw = component$(() => {
  throw new Error('PRIVATE_RENDER_ERROR');
});
const Broken = component$(({ shared }: { shared: Signal<number> }) => {
  useStyles('.private{content:"PRIVATE_DISCARDED_STYLE"}', 'discarded-style');
  const privateState = useSignal(new Error('PRIVATE_SIGNAL_ERROR'));
  return (
    <div>
      <button
        onClick$={() => {
          privateState.value.message;
        }}
      >
        discarded handler
      </button>
      <button onClick$={sync$(() => 'PRIVATE_DISCARDED_SYNC')}>discarded sync</button>
      <span>{shared.value + privateState.value.message}</span>
      <Throw />
    </div>
  );
});
const SlowFail = component$(async () => {
  useStyles('.private-async{content:"PRIVATE_ASYNC_STYLE"}', 'discarded-async-style');
  const privateState = useSignal(new Error('PRIVATE_ASYNC_ERROR'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  throw privateState.value;
});
const BrokenEncoder = component$(() => {
  const value = useSerializer$({
    initial: 0,
    deserialize: (state: number) => state,
    serialize: () => {
      throw new Error('PRIVATE_ENCODER_ERROR');
    },
  });
  return <p>{value.value}</p>;
});
const Fallback = component$(({ error, id }: { error: Error & { digest?: string }; id: string }) => {
  useStyles('.digest{color:rgb(1,2,3)}', 'fallback-style');
  const count = useSignal(0);
  return (
    <section id={id}>
      <p>{error.message}</p>
      <output class="digest">{error.digest}</output>
      <button onClick$={() => count.value++}>increment fallback</button>
      <output class="count">{count.value}</output>
    </section>
  );
});
export default component$(() => {
  const shared = useSignal(0);
  return (
    <main>
      <button id="shared-button" onClick$={() => shared.value++}>
        increment shared
      </button>
      <output id="shared-count">{shared.value}</output>
      <Catch fallback$={(error) => <Fallback id="sync-caught" error={error} />}>
        <Broken shared={shared} />
      </Catch>
      <Catch fallback$={(error) => <Fallback id="encoder-caught" error={error} />}>
        <BrokenEncoder />
      </Catch>
      <Catch fallback$={(error) => <Fallback id="async-caught" error={error} />}>
        <Pending fallback$={() => <p id="pending-shell">waiting</p>}>
          <SlowFail />
        </Pending>
      </Catch>
    </main>
  );
});
