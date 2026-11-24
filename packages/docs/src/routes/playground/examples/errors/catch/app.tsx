import { Catch, component$, useSignal, type Signal } from '@qwik.dev/core';

const Fragile = component$((props: { broken: Signal<boolean> }) => {
  if (props.broken.value) {
    throw new Error('Fragile component failed to render');
  }
  return <p>Fragile component is fine.</p>;
});

// The server render fails, so <Catch> sends its fallback in the HTML.
// Switch to production mode: the server error message is replaced by a digest.
export default component$(() => {
  const broken = useSignal(true);

  return (
    <main>
      <Catch
        fallback$={(error, reset) => (
          <div role="alert">
            <p>
              Caught: {error.message} {error.digest && <code>{error.digest}</code>}
            </p>
            <button
              onClick$={() => {
                broken.value = false;
                reset();
              }}
            >
              Fix and retry
            </button>
          </div>
        )}
        onError$={(error, info) => console.log(`[${info.phase}]`, error.message)}
      >
        <Fragile broken={broken} />
      </Catch>

      <button onClick$={() => (broken.value = true)}>Break it again</button>
    </main>
  );
});
