import { component$, Slot, useSignal } from '@qwik.dev/core';
import { delay } from '../delay';

export const AsyncCmp = component$(async () => {
  await delay(5000);
  return <span id="async-result">Async done</span>;
});

const SlotWrapper = component$(() => (
  <section>
    <Slot />
  </section>
));

export const StreamingFlush = component$<{ mode?: 'branch' | 'slot' }>((props) => {
  const show = useSignal(true);
  return (
    <div>
      <h1 id="prefix">Prefix content</h1>
      {props.mode === 'slot' ? (
        <SlotWrapper>
          <AsyncCmp />
        </SlotWrapper>
      ) : props.mode === 'branch' ? (
        show.value && <AsyncCmp />
      ) : (
        <AsyncCmp />
      )}
    </div>
  );
});
