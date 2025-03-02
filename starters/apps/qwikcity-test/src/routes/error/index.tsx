import { component$, $ } from "@builder.io/qwik";
import { ErrorBoundary } from "@builder.io/qwik-city";

export default component$(() => {
  return <Issue7227 />;
});

const Issue7227 = component$(() => {
  return (
    <ErrorBoundary
      fallback$={$((error) => {
        return <div>Caught error: {error.message}</div>;
      })}
    >
      <div>
        All good
        <button
          onClick$={$(() => {
            throw new Error("Boom!");
          })}
        >
          Throw error
        </button>
      </div>
    </ErrorBoundary>
  );
});
