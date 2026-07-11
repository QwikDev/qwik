import { describe, it, expect, vi } from 'vitest';
import { ssrCreateContainer } from './ssr-container';
import { QDefaultSlot, QError, QStyle, VNodeDataChar, encodeVNodeDataString } from './qwik-copy';
import { VNodeDataFlag, type RenderToStreamOptions } from './types';
import { OPEN_FRAGMENT, CLOSE_FRAGMENT } from './vnode-data';
import { StreamHandler } from './ssr-stream-handler';
import { StringSSRWriter } from './ssr-stream-writer';

vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

const createTestContainer = () => {
  const writer = new StringSSRWriter();

  const container = ssrCreateContainer({
    tagName: 'div',
    writer,
    renderOptions: {
      qwikLoader: 'inline',
    },
    streamHandler: new StreamHandler({} as RenderToStreamOptions, {
      firstFlush: 0,
      render: 0,
      snapshot: 0,
    }),
  });

  return { container, writer };
};

const getNoScriptHereCount = (container: ReturnType<typeof ssrCreateContainer>) => {
  // Raw-text elements do not allow observable nested element output, so this focused regression
  // test inspects the internal guard directly.
  return Reflect.get(container, '$noScriptHere$') as number;
};

describe('SSR Container', () => {
  it('should reject unsafe element names before writing markup', async () => {
    const validElementNames = ['div', 'my-widget', 'svg:path', 'foreignObject'];
    for (let i = 0; i < validElementNames.length; i++) {
      const elementName = validElementNames[i];
      const { container, writer } = createTestContainer();

      container.openElement(elementName, null, {}, null, null, null);
      await container.closeElement();

      expect(writer.toString()).toBe(`<${elementName} :=""></${elementName}>`);
    }

    const invalidElementNames = [
      '',
      '1section',
      'section demo',
      'section\tdemo',
      'section\ndemo',
      'section/demo',
      'section>demo',
      'section<demo',
      'section=demo',
      'section"demo',
      "section'demo",
      'section\0demo',
    ];
    for (let i = 0; i < invalidElementNames.length; i++) {
      const elementName = invalidElementNames[i];
      const { container, writer } = createTestContainer();

      expect(() => container.openElement(elementName, null, {}, null, null, null)).toThrow(
        `Code(Q${QError.invalidElementName})`
      );
      expect(writer.toString()).toBe('');
    }
  });

  it('should not emit Qwik loader before style elements', async () => {
    const { container, writer } = createTestContainer();

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

  it('should not emit inline Qwik loader while inside foreign content', async () => {
    const foreignElements = ['svg', 'math'];
    for (let i = 0; i < foreignElements.length; i++) {
      const foreignElement = foreignElements[i];
      const { container, writer } = createTestContainer();

      container.openContainer();
      container.openElement(foreignElement, null, {}, null, null, null);
      container.textNode('x'.repeat(30 * 1024));
      container.openElement('g', null, {}, null, null, null);
      await container.closeElement();
      await container.closeElement();

      container.openElement('div', null, {}, null, null, null);
      await container.closeElement();
      await container.closeContainer();

      const html = writer.toString();
      const foreignStart = html.indexOf(`<${foreignElement}`);
      const foreignEnd = html.indexOf(`</${foreignElement}>`);
      const loaderIdx = html.indexOf('id="qwikloader"');

      expect(loaderIdx).toBeGreaterThan(-1);
      expect(foreignStart).toBeGreaterThan(-1);
      expect(foreignEnd).toBeGreaterThan(foreignStart);
      expect(loaderIdx).toBeGreaterThan(foreignEnd);
    }
  });

  it('should track blocked parser-state elements in the no-script refcounter', async () => {
    const blockedElements = [
      'script',
      'style',
      'textarea',
      'title',
      'iframe',
      'noframes',
      'noscript',
      'xmp',
      'template',
    ];
    for (let i = 0; i < blockedElements.length; i++) {
      const elementName = blockedElements[i];
      const { container } = createTestContainer();

      container.openContainer();
      expect(getNoScriptHereCount(container)).toBe(0);
      container.openElement(elementName, null, {}, null, null, null);
      expect(getNoScriptHereCount(container)).toBe(1);
      await container.closeElement();
      expect(getNoScriptHereCount(container)).toBe(0);
      await container.closeContainer();
    }
  });

  it('should encode custom attributes with separators in emitVNodeData', () => {
    const writer = new StringSSRWriter();

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

  it('should encode default slot projection refs with wrapped values', () => {
    const writer = new StringSSRWriter();

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

    (container as any).vNodeDatas = [
      [
        VNodeDataFlag.SERIALIZE | VNodeDataFlag.VIRTUAL_NODE,
        { [QDefaultSlot]: '-1A' },
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

    expect(vnodeContent).toContain('|||\\-1A|');
  });
});
