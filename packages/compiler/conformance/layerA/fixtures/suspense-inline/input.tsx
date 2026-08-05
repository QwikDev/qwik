import { Suspense } from '@qwik.dev/core';

export async function Delayed() {
  await Promise.resolve();
  return <p>Loaded!</p>;
}

export function App() {
  return (
    <section>
      <Suspense fallback={<em>waiting</em>}>
        <Delayed />
      </Suspense>
    </section>
  );
}
