import { $, component$, ErrorBoundary, type JSXOutput } from '@qwik.dev/core';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false;

// An async-generator child that streams one chunk, then throws mid-stream. Before the fix this throw
// escaped the async-generator StackFn (awaited inside a try-with-only-finally) and aborted SSR
// instead of routing to the enclosing <ErrorBoundary>.
const AsyncGenThrower = component$(() => {
  return (
    <>
      {(async function* () {
        yield <div id="chunk">chunk</div>;
        throw new Error('async gen boom');
      })()}
    </>
  ) as unknown as JSXOutput;
});

// Throws a NON-serializable value (a class instance with a method). Before the S4 fix this raw value
// was stored on the error store and then failed `verifySerializable` at final state emit, aborting
// the whole page with a confusing serializer error instead of rendering the boundary fallback.
class NonSerializableError {
  message = 'non-serializable boom';
  toJSON() {
    return this.message;
  }
}

const NonSerializableThrower = component$((): JSXOutput => {
  throw new NonSerializableError();
});

const NormalErrorThrower = component$((): JSXOutput => {
  throw new Error('normal boom');
});

describe('ErrorBoundary SSR async-generator + non-serializable throws (experimental)', () => {
  it('S2: routes an async-generator child throw to the enclosing boundary fallback', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <AsyncGenThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async gen boom');
  });

  it('S4: a non-serializable throw renders the fallback AND the page still serializes', async () => {
    // The key assertion is that ssrRenderToDom RESOLVES (the page serialized) rather than rejecting
    // with a verifySerializable error.
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <NonSerializableThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: non-serializable boom'
    );
  });

  it('S4: a normal Error throw is unchanged (still renders its fallback)', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <NormalErrorThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: normal boom');
  });
});
