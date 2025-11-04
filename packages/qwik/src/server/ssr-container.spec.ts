import { describe, it, expect, vi } from 'vitest';
import { ssrCreateContainer } from './ssr-container';
import { QStyle } from './qwik-copy';

vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

describe('SSR Container', () => {
  it('should not emit Qwik loader before style elements', async () => {
    const writer = {
      chunks: [] as string[],
      write(text: string) {
        this.chunks.push(text);
      },
      toString() {
        return this.chunks.join('');
      },
    };

    const container = ssrCreateContainer({
      tagName: 'div',
      writer,
      renderOptions: {
        qwikLoader: 'inline', // Force inline loader
      },
    });

    // Open container
    container.openContainer();
    // Add a large content to exceed 30KB while opening the next element
    const largeContent = 'x'.repeat(30 * 1024);
    container.openElement('div', null);
    container.textNode(largeContent);
    await container.closeElement();
    // Add a style element with QStyle attribute
    container.openElement('style', [QStyle, 'my-style-id']);
    container.write('.my-class { color: red; }');
    await container.closeElement();
    // Add another regular elementm
    container.openElement('div', null);
    await container.closeElement();
    await container.closeContainer();

    const html = writer.toString();
    expect(html.indexOf('id="qwikloader"')).toBeGreaterThan(html.indexOf('my-style-id'));
  });
});
