import { component$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { ssrRender } from '../test-utils';

const debug = false;

describe('ssrRender: qwikloader', () => {
  it('should emit qwikloader and event registrations for event handlers', async () => {
    const MyComp = component$(() => {
      return <button onClick$={() => undefined}>Click</button>;
    });

    const { container, html, cleanup } = await ssrRender(<MyComp />, { debug });

    expect(container.querySelector('button')?.getAttribute('q-e:click')).toBeTruthy();
    expect(html).toContain('id="qwikloader"');
    expect(html).toContain('(window._qwikEv||(window._qwikEv=[])).push("e:click")');

    cleanup();
  });

  it('should keep event registrations when qwikloader is disabled', async () => {
    const MyComp = component$(() => {
      return <button onClick$={() => undefined}>Click</button>;
    });

    const { html, cleanup } = await ssrRender(<MyComp />, { debug, qwikLoader: 'never' });

    expect(html).not.toContain('id="qwikloader"');
    expect(html).toContain('(window._qwikEv||(window._qwikEv=[])).push("e:click")');

    cleanup();
  });
});
