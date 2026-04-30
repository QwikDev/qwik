import {
  component$,
  Suspense,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';

const AsyncMessage = component$(() => {
  const content = new Promise<JSXOutput>((resolve) => {
    setTimeout(() => resolve(<p>Async content resolved.</p>), 1000);
  });

  return <>{content}</>;
});

export default component$(() => {
  const show = useSignal(false);

  return (
    <section>
      <button onClick$={() => (show.value = !show.value)}>
        {show.value ? 'Hide' : 'Show'} content
      </button>

      {show.value && (
        <Suspense fallback={<p>Loading content...</p>} delay={150}>
          <AsyncMessage />
        </Suspense>
      )}
    </section>
  );
});
