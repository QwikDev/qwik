import { component$ } from '@qwik.dev/core';
import { useServerData } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

const useRequestValue = () => useServerData<string>('value', 'fallback');

it('returns the fallback outside a render context', () => {
  expect(useServerData('value', 'fallback')).toBe('fallback');
  expect(useServerData('value')).toBeUndefined();
});

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: useServerData', ({ render }) => {
  it('reads request data and preserves fallback semantics in a custom hook', async () => {
    const App = component$(() => {
      const value = useRequestValue();
      const missing = useServerData('missing', 'missing-fallback');
      const nullValue = useServerData('null-value', 'null-fallback');
      return <p>{`${value}/${missing}/${nullValue}`}</p>;
    });

    const { container, cleanup } = await render(App, {
      debug,
      serverData: { value: 'request-value', 'null-value': null },
    });

    expect(container.querySelector('p')!.textContent).toBe(
      'request-value/missing-fallback/null-fallback'
    );
    cleanup();
  });

  it('shares request data with nested components', async () => {
    const Child = component$(() => {
      const value = useServerData<string>('value', 'fallback');
      return <span>{value}</span>;
    });
    const App = component$(() => <Child />);

    const { container, cleanup } = await render(App, {
      debug,
      serverData: { value: 'nested-value' },
    });

    expect(container.querySelector('span')!.textContent).toBe('nested-value');
    cleanup();
  });
});

describe('useServerData resume', () => {
  it('serializes only a captured value rather than the complete serverData object', async () => {
    const App = component$(() => {
      const value = useServerData<string>('value');
      return (
        <button
          onClick$={() => {
            (globalThis as any).__qwikServerDataValue = value;
          }}
        >
          Read
        </button>
      );
    });

    const { container, html, cleanup, qwikLoader } = await ssrRender(App, {
      debug,
      serverData: { value: 'captured-value', secret: 'unused-server-secret' },
    });
    const button = container.querySelector('button')!;

    expect(html).toContain('captured-value');
    expect(html).not.toContain('unused-server-secret');

    try {
      await qwikLoader!.dispatch(button, 'click');
      expect((globalThis as any).__qwikServerDataValue).toBe('captured-value');
    } finally {
      cleanup();
      delete (globalThis as any).__qwikServerDataValue;
    }
  });
});
