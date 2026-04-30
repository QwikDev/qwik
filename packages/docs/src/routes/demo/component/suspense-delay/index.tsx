import {
  component$,
  Suspense,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';

const LOAD_MS = 2500;
const FALLBACK_DELAY_MS = 1000;

const SlowContent = component$(() => (
  <>
    {
      new Promise<JSXOutput>((resolve) => {
        setTimeout(() => resolve(<p>Loaded content.</p>), LOAD_MS);
      })
    }
  </>
));

export default component$(() => {
  const run = useSignal(0);
  const elapsed = useSignal(0);

  return (
    <section>
      <button
        disabled={run.value > 0 && elapsed.value < LOAD_MS}
        onClick$={() => {
          run.value++;
          elapsed.value = 0;

          const start = Date.now();
          const timer = setInterval(() => {
            elapsed.value = Math.min(Date.now() - start, LOAD_MS);

            if (elapsed.value === LOAD_MS) {
              clearInterval(timer);
            }
          }, 100);
        }}
      >
        Load content
      </button>

      {run.value > 0 && (
        <Suspense
          fallback={<p>Fallback shown after {FALLBACK_DELAY_MS}ms.</p>}
          delay={FALLBACK_DELAY_MS}
        >
          <SlowContent key={run.value} />
        </Suspense>
      )}

      <p>Elapsed: {elapsed.value}ms</p>
    </section>
  );
});
