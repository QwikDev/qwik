import { component$, $, ErrorBoundary } from '@qwik.dev/core';

export default component$(() => {
  return <UseErrorBoundaryNoEffectIssue7227 />;
});

const UseErrorBoundaryNoEffectIssue7227 = component$(() => {
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
            throw new Error('Boom!');
          })}
        >
          Throw error
        </button>
      </div>
    </ErrorBoundary>
  );
});
