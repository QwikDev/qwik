import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { createInternalServerComponent } from '../ssr/internal-server-component';

// Drives the container checkpoint/rollback through a real SSR render: render some content into a
// stream block, snapshot, render a subtree, discard it, then render a replacement. The replacement
// must end up where the discarded subtree was, and the result must still resume on the client.
const Buffered = createInternalServerComponent(async (ssr, _jsx, options) => {
  ssr.streamHandler.streamBlockStart();
  await ssr.renderJSX(<div id="keep">keep</div>, options);
  const cp = ssr.checkpoint();
  await ssr.renderJSX(
    <div id="discard">
      <span>discarded</span>
    </div>,
    options
  );
  ssr.rollback(cp);
  await ssr.renderJSX(<p id="fb">fallback</p>, options);
  await ssr.streamHandler.streamBlockEnd();
});

describe('SSR checkpoint/rollback', () => {
  it('discards a rolled-back subtree, keeps prior output, renders the replacement, and resumes', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <Buffered />
      </main>,
      { debug: false }
    );
    const el = container.element;
    expect(el.querySelector('#keep')?.textContent).toBe('keep');
    expect(el.querySelector('#fb')?.textContent).toBe('fallback');
    expect(el.querySelector('#discard')).toBeFalsy();
    expect(el.querySelector('span')).toBeFalsy();
  });
});
