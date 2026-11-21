import { Catch, component$, useSignal, type Signal } from '@qwik.dev/core';

const Fragile = component$((props: { broken: Signal<boolean> }) => {
  if (props.broken.value) {
    throw new Error('Fragile component failed to render');
  }
  return <p>Fragile component is fine.</p>;
});

export default component$(() => {
  const broken = useSignal(true);
  return (
    <main>
      <Catch
        fallback$={(_error, reset) => (
          <button
            onClick$={() => {
              broken.value = false;
              reset();
            }}
          >
            Fix and retry
          </button>
        )}
      >
        <Fragile broken={broken} />
      </Catch>
      <button onClick$={() => (broken.value = true)}>Break it again</button>
    </main>
  );
});
