import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import { QErrorContentHost, QErrorFallbackHost } from '../shared/utils/markers';

// Drive the in-order unwind directly (the throw handler's mechanism, in isolation): open a
// content-host, nest still-open tags inside it, then `closeOpenElementsTo` back to the content-host
// and render a SIBLING fallback-host. The streamed HTML must be well-formed — the partial content
// sits closed inside the hideable content-host, and the fallback-host is its sibling (NOT nested),
// so hiding the content-host can't hide the fallback. This is the A6 property in isolation.
const Unwound = createInternalServerComponent(async (ssr: any, _jsx: any, options: any) => {
  await ssr.renderJSX(<div id="before">before</div>, options);

  ssr.openElement('div', null, { [QErrorContentHost]: '1', style: 'display:contents' });
  const contentHostFrame = ssr.getCurrentElementFrame();
  const contentHostNode = ssr.getOrCreateLastNode();

  // deeply nested partial content; the "throw" happens inside <b>, leaving section/ul/li/b all open
  ssr.openElement('section', null, null);
  ssr.openElement('ul', null, null);
  ssr.openElement('li', null, null);
  await ssr.renderJSX(<b id="partial">partial</b>, options);

  // --- throw here ---
  ssr.closeOpenElementsTo(contentHostFrame);
  contentHostNode.setTreeNonUpdatable();

  // sibling fallback-host (currentElementFrame is now the content-host's parent)
  ssr.openElement('div', null, { [QErrorFallbackHost]: '1' });
  await ssr.renderJSX(<p id="fb">fallback</p>, options);
  ssr.closeElement();
});

describe('SSR in-order unwind (closeOpenElementsTo)', () => {
  it('closes partial content into the content-host and renders the fallback as a sibling', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <Unwound />
      </main>,
      { debug: false }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc="1"]')!;
    const fallbackHost = el.querySelector('[q\\:ebf="1"]')!;

    // both hosts exist and the partial sits INSIDE the (closed) content-host
    expect(contentHost).toBeTruthy();
    expect(fallbackHost).toBeTruthy();
    expect(contentHost.querySelector('#partial')?.textContent).toBe('partial');
    expect(fallbackHost.querySelector('#fb')?.textContent).toBe('fallback');

    // the fallback-host is a SIBLING of the content-host, not nested inside it (the swap invariant)
    expect(contentHost.contains(fallbackHost)).toBe(false);
    expect(fallbackHost.closest('[q\\:ebc="1"]')).toBeNull();
    expect(contentHost.parentElement).toBe(fallbackHost.parentElement);

    // prior sibling outside the boundary survived
    expect(el.querySelector('#before')?.textContent).toBe('before');
  });
});
