import { Suspense, component$, useSignal } from '@qwik.dev/core';

export const SlowCount = component$(({ count }: { count: number }) => {
  if (count === 0) {
    return <p>Loaded count: 0</p>;
  }

  return (
    <p>
      Loaded count:{' '}
      {
        new Promise<number>((resolve) => {
          setTimeout(() => resolve(count), 700);
        })
      }
    </p>
  );
});

export default component$(() => {
  const count = useSignal(0);

  return (
    <main>
      <p>
        Click the button to request a delayed value. The requested count updates immediately, while
        the Suspense boundary shows a fallback until the async content finishes rendering.
      </p>

      <p>Requested count: {count.value}</p>

      <p>
        <button onClick$={() => count.value++}>Load next count</button>
      </p>

      <Suspense fallback={<p>Loading delayed count...</p>} timeout={150}>
        <SlowCount count={count.value} />
      </Suspense>
    </main>
  );
});
