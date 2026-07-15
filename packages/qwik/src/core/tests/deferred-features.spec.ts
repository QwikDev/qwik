import { describe, it } from 'vitest';

describe.skip('features deferred by the target-native cutover', () => {
  it('Resource', () => {
    const source = `
      import { component$, useResource$ } from '@qwik.dev/core';
      export const App = component$(() => {
        const value = useResource$(() => Promise.resolve('ready'));
        return <p>{value}</p>;
      });
    `;
    void source;
  });

  it('ErrorBoundary', () => {
    const source = `
      import { component$, useErrorBoundary } from '@qwik.dev/core';
      export const App = component$(() => {
        const error = useErrorBoundary();
        return error.value ? <p>{error.value.message}</p> : <Child />;
      });
    `;
    void source;
  });

  it('Suspense and out-of-order streaming', () => {
    const source = `
      import { component$, Suspense } from '@qwik.dev/core';
      export const App = component$(() => (
        <Suspense fallback={<p>loading</p>}><AsyncChild /></Suspense>
      ));
    `;
    void source;
  });

  it('SSR backpatch', () => {
    const source = `
      export const App = () => <button title={getAsyncTitle()}>content</button>;
      // Future streaming SSR emits a typed attribute patch for the resolved title.
    `;
    void source;
  });
});
