import { component$, $ } from "@qwik.dev/core";
import { ErrorBoundary } from "@qwik.dev/router";

export default component$(() => {
  return <Issue7227 />;
});

const Issue7227 = component$(() => {
  return (
    <ErrorBoundary
      fallback$={$((error: any) => {
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
