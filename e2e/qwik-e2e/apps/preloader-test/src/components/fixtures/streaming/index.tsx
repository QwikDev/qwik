import { component$, SSRStream, useSignal } from '@qwik.dev/core';
import { holdStream } from './stream-gate';

const ENOUGH_HTML_FOR_THE_SERVER_TO_SEND_QWIKLOADER = 'streamed '.repeat(2500);

export default component$(() => {
  const count = useSignal(0);
  return (
    <section class="fixture" data-fixture="streaming">
      <h2>click while the page is still streaming</h2>
      <p hidden>{ENOUGH_HTML_FOR_THE_SERVER_TO_SEND_QWIKLOADER}</p>
      <button data-testid="trigger" onClick$={() => count.value++}>
        Count
      </button>
      <output data-testid="result" data-done={count.value ? '' : undefined}>
        {count.value}
      </output>
      <SSRStream>
        {async function* () {
          await holdStream();
          yield <p data-testid="stream-end">streamed</p>;
        }}
      </SSRStream>
    </section>
  );
});
