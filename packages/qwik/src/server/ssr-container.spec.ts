import { describe, it, expect, vi } from 'vitest';
import { ssrCreateContainer } from './ssr-container';
import { QStyle, VNodeDataChar, encodeVNodeDataString } from './qwik-copy';
import { VNodeDataFlag, type RenderToStreamOptions } from './types';
import { OPEN_FRAGMENT, CLOSE_FRAGMENT } from './vnode-data';
import { StreamHandler } from './ssr-stream-handler';

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
      streamHandler: new StreamHandler({} as RenderToStreamOptions, {
        firstFlush: 0,
        render: 0,
        snapshot: 0,
      }),
    });

    // Open container
    container.openContainer();
    // Add a large content to exceed 30KB while opening the next element
    const largeContent = 'x'.repeat(30 * 1024);
    container.openElement('div', null, {}, null, null, null);
    container.textNode(largeContent);
    await container.closeElement();
    // Add a style element with QStyle attribute
    container.openElement('style', null, { [QStyle]: 'my-style-id' }, null, null, null);
    container.write('.my-class { color: red; }');
    await container.closeElement();
    // Add another regular elementm
    container.openElement('div', null, {}, null, null, null);
    await container.closeElement();
    await container.closeContainer();

    const html = writer.toString();
    expect(html.indexOf('id="qwikloader"')).toBeGreaterThan(html.indexOf('my-style-id'));
  });

  it('should encode custom attributes with separators in emitVNodeData', () => {
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
      streamHandler: new StreamHandler({} as RenderToStreamOptions, {
        firstFlush: 0,
        render: 0,
        snapshot: 0,
      }),
    });
    container.openContainer();

    const mockRoot = {};
    container.serializationCtx.$roots$.push(mockRoot);

    // Create vNodeData with custom attribute in the default case
    const customKey = 'custom-attr';
    const customValue = 'test-value';
    (container as any).vNodeDatas = [
      [
        VNodeDataFlag.SERIALIZE | VNodeDataFlag.VIRTUAL_NODE,
        [customKey, customValue],
        OPEN_FRAGMENT,
        CLOSE_FRAGMENT,
      ],
    ];

    (container as any).emitVNodeData();

    const output = writer.toString();

    const vnodeStart = output.indexOf('<script type="qwik/vnode" :="">');
    const vnodeEnd = output.indexOf('</script>', vnodeStart);
    const vnodeContent = output.substring(
      vnodeStart + '<script type="qwik/vnode" :="">'.length,
      vnodeEnd
    );

    const encodedKey = encodeVNodeDataString(customKey);
    const encodedValue = encodeVNodeDataString(customValue);
    expect(vnodeContent).toContain(
      `${VNodeDataChar.SEPARATOR_CHAR}${encodedKey}${VNodeDataChar.SEPARATOR_CHAR}`
    );
    expect(vnodeContent).toContain(
      `${VNodeDataChar.SEPARATOR_CHAR}${encodedValue}${VNodeDataChar.SEPARATOR_CHAR}`
    );
  });
});
