import { describe, expect, it } from 'vitest';
import { createDocument } from '../../testing/document';
import { render } from './csr-render';

describe('vdomless csr render', () => {
  it('mounts and cleans up scalar root output', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;

    const result = await render((_props, ctx) => {
      const node = ctx.document.createElement('span');
      node.textContent = 'one';
      return node;
    }, host);

    expect(host.innerHTML).toBe('<span>one</span>');

    result.cleanup();

    expect(host.innerHTML).toBe('');
  });
});
