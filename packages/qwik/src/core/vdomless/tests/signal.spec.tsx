import { component$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';
import { createSignal } from '@qwik.dev/core/spark';
import { TypeIds } from '../../shared/serdes/constants';
import { EffectKind } from '../dom/effect/effect-kind.enum';

const debug = true;

describe.each([
  { name: 'ssrRender', render: ssrRender }, //
  { name: 'csrRender', render: csrRender }, //
])('$name: signals', ({ render }) => {
  it('should render signal', async () => {
    const MyComp = component$(() => {
      const count = createSignal(0);
      return <p>{count.value}</p>;
    });

    const { container, html, cleanup } = await render(<MyComp />, { debug });

    if (render === ssrRender) {
      expect(container.innerHTML).toContain('<p q:id="0">0</p>');
      expect(html).toContain('<p q:id="0">0</p>');

      const script = container.querySelector('script[type="qwik/state"]');
      expect(script).not.toBeNull();
      const state = JSON.parse(script!.textContent!);
      const signalPayload = state[1] as unknown[];
      const effectPayload = signalPayload[3] as unknown[];

      expect(state[0]).toBe(TypeIds.Signal);
      expect(signalPayload[2]).toBe(TypeIds.EffectSubscription);
      expect(effectPayload[1]).toBe(EffectKind.TextNode);
    } else {
      expect(container.innerHTML).toBe('<p>0</p>');
      expect(html).toBe('<p>0</p>');
    }

    cleanup();
  });
});
