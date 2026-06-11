import { createContextId } from '@qwik.dev/core';
import {
  createContext,
  createContextProvider,
  createSignal,
  type Signal,
} from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender }, //
  { name: 'csrRender', render: csrRender }, //
])('$name: context', ({ render }) => {
  it('should provide and retrieve context', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-integration');
      const source = createSignal('provided');
      createContextProvider(contextId, source);
      const context = createContext(contextId);

      return <p>{context.value}</p>;
    };

    const { container, cleanup } = await render(<MyComp />, { debug });

    expect(container.querySelector('p')?.textContent).toBe('provided');

    cleanup();
  });

  it('should keep retrieved context reactive', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-reactive');
      const source = createSignal('before');
      createContextProvider(contextId, source);
      const context = createContext(contextId);

      return <button onClick$={() => (context.value = 'after')}>{context.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('before');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('after');

    cleanup();
  });
});
