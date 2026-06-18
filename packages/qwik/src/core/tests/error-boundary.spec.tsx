import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { $, ErrorBoundary } from '@qwik.dev/core';

const debug = false;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: ErrorBoundary', ({ render }) => {
  it('should project children when there is no error', async () => {
    const { document } = await render(
      <ErrorBoundary
        fallback$={$((error: any) => (
          <p>Caught: {error.message}</p>
        ))}
      >
        <div>All good</div>
      </ErrorBoundary>,
      { debug }
    );

    expect(document.body.textContent).toContain('All good');
    expect(document.body.textContent).not.toContain('Caught');
  });

  it('should render the fallback when a qerror window event fires', async () => {
    const { container, document } = await render(
      <ErrorBoundary
        fallback$={$((error: any) => (
          <p>Caught: {error.message}</p>
        ))}
      >
        <div>All good</div>
      </ErrorBoundary>,
      { debug }
    );

    await trigger(container.element, null, 'w:qerror', {
      detail: { error: new Error('Boom!') },
    });

    expect(document.body.querySelector('p')?.textContent).toContain('Caught: Boom!');
    expect(document.body.textContent).not.toContain('All good');
  });

  it('should keep projecting children when no fallback is provided', async () => {
    const { container, document } = await render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
      { debug }
    );

    // Without a fallback the error is recorded but children keep rendering.
    await trigger(container.element, null, 'w:qerror', {
      detail: { error: new Error('Boom!') },
    });

    expect(document.body.textContent).toContain('All good');
  });
});
