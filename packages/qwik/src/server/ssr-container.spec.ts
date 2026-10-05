import { describe, it, expect, vi } from 'vitest';
import { createDocument } from '@qwik.dev/core/testing';
import { _createQRL } from '@qwik.dev/core/internal';
import { SSRSegmentContainer, ssrCreateContainer } from './ssr-container';
import {
  QDefaultSlot,
  QError,
  OnRenderProp,
  QSlot,
  QStyle,
  ELEMENT_ID,
  VNodeDataChar,
  encodeVNodeDataKey,
  encodeVNodeDataString,
} from './qwik-copy';
import { VNodeDataFlag, type RenderToStreamOptions } from './types';
import { OPEN_FRAGMENT, CLOSE_FRAGMENT, type VNodeData } from './vnode-data';
import { SsrNode } from './ssr-node';
import { StreamHandler } from './ssr-stream-handler';
import { StringBufferSegmentWriter, StringSSRWriter } from './ssr-stream-writer';

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

const createVNodeIdContexts = () => {
  const { container } = createTestContainer();
  const root = container as ConstructorParameters<typeof SSRSegmentContainer>[1];
  const createSegment = (id: string) => {
    const segment = new SSRSegmentContainer(
      {
        tagName: root.tag,
        writer: new StringBufferSegmentWriter(),
        streamHandler: root.streamHandler as StreamHandler,
        locale: root.$locale$,
        timing: root.timing,
        buildBase: '/build/',
        resolvedManifest: root.resolvedManifest,
        renderOptions: root.renderOptions,
      },
      root
    );
    Reflect.set(segment, 'vnodeSegment', id);
    root.outOfOrderSegments.push(segment);
    return segment;
  };
  const first = createSegment('1');
  const second = createSegment('2');
  const createNode = () => {
    const vnodeData: VNodeData = [
      VNodeDataFlag.SERIALIZE | VNodeDataFlag.VIRTUAL_NODE,
      {},
      OPEN_FRAGMENT,
      CLOSE_FRAGMENT,
    ];
    return new SsrNode(null, '0', 1, [], vnodeData, null);
  };
  const firstNode = createNode();
  const secondNode = createNode();
  const shellNode = createNode();
  for (let i = 0; i < 3; i++) {
    root.serializationCtx.$addRoot$({});
    first.serializationCtx.$addRoot$({});
    second.serializationCtx.$addRoot$({});
  }
  Reflect.get(first, '$commitRoots$').call(first, root, first.serializationCtx);
  Reflect.get(second, '$commitRoots$').call(second, root, second.serializationCtx);
  const maps = Reflect.get(root, 'segmentRootIdMaps') as number[][];
  expect(maps[1][2]).toBe(5);
  expect(maps[2][2]).toBe(8);
  first.setHostProp(firstNode, ELEMENT_ID, 2);
  second.setHostProp(secondNode, ELEMENT_ID, 2);
  root.setHostProp(shellNode, ELEMENT_ID, 2);
  const entries: [number, VNodeData][] = [
    [0, firstNode.vnodeData],
    [1, secondNode.vnodeData],
    [2, shellNode.vnodeData],
  ];
  return { root, first, second, firstNode, secondNode, shellNode, entries, maps };
};

const getIds = (html: string) =>
  Array.from(
    createDocument({ html })
      .querySelector('script[type="qwik/vnode"]')!
      .textContent!.matchAll(/=(\d+)/g),
    (match) => Number(match[1])
  );

describe('SSR Container', () => {
  const contexts = ['root', 'first', 'second'] as const;
  const vnodeIdCases = contexts.flatMap((source) =>
    contexts.flatMap((writer) => [false, true].map((patch) => ({ source, writer, patch })))
  );

  it.each(vnodeIdCases)(
    'writes q:id from $source through $writer (patch=$patch)',
    ({ source, writer, patch }) => {
      const { root, first, second, shellNode, firstNode, secondNode } = createVNodeIdContexts();
      const emittingContext = { root, first, second }[writer];
      const node = { root: shellNode, first: firstNode, second: secondNode }[source];
      const expectedId = { root: 2, first: 5, second: 8 }[source];
      Reflect.get(emittingContext, 'emitVNodeDataScript').call(
        emittingContext,
        undefined,
        [[0, node.vnodeData]],
        patch
      );
      const output = emittingContext.writer.toString([100, 101, 102]);
      expect(getIds(output)).toEqual([expectedId]);
      expect(node.getProp(ELEMENT_ID)).toBe({ root: 2, first: -6, second: -9 }[source]);
    }
  );

  it('uses the assigning context when another segment writes vnode ids', () => {
    const { root, first, second, firstNode, secondNode, entries, maps } = createVNodeIdContexts();
    Reflect.get(second, 'emitVNodeDataScript').call(second, '1', entries, true);
    const output = second.writer.toString([100, 101, 102]);
    expect(getIds(output)).toEqual([5, 8, 2]);
    expect(firstNode.getProp(ELEMENT_ID)).toBe(-6);
    expect(secondNode.getProp(ELEMENT_ID)).toBe(-9);

    const lateLocalId = first.serializationCtx.$addRoot$({});
    first.setHostProp(firstNode, ELEMENT_ID, lateLocalId);
    expect(Reflect.get(root, 'segmentRootIdMaps')).toBe(maps);
    expect(maps[1][lateLocalId]).toBe(9);
    Reflect.set(first, '$outOfOrderState$', 2);
    root.removeOutOfOrderSegment(first);
    expect(root.outOfOrderSegments).toEqual([second]);
    (second.writer as StringBufferSegmentWriter).clear();
    Reflect.get(second, 'emitVNodeDataScript').call(second, '1', entries, true);
    expect(getIds(second.writer.toString())).toEqual([9, 8, 2]);

    first.setHostProp(firstNode, ELEMENT_ID, 134_217_726);
    const encoded = firstNode.getProp(ELEMENT_ID);
    expect(Reflect.get(first, 'getVNodeDataOwnerFromNodeId').call(first, String(encoded))).toEqual({
      owner: '1',
      localIndex: 134_217_726,
    });
    expect(() => first.setHostProp(firstNode, ELEMENT_ID, 134_217_727)).toThrow(
      'Invalid segment root id'
    );
    const invalidLocalIds = [-1, 0.5, NaN, Infinity];
    for (let i = 0; i < invalidLocalIds.length; i++) {
      const localId = invalidLocalIds[i];
      expect(() => first.setHostProp(firstNode, ELEMENT_ID, localId)).toThrow(
        'Invalid segment root id'
      );
    }
    first.setHostProp(firstNode, ELEMENT_ID, first.serializationCtx.$roots$.length);
    expect(() =>
      Reflect.get(second, 'emitVNodeDataScript').call(second, '1', entries, true)
    ).toThrow('Code(Q19): Serialization Error: Missing root id for segment 1 root');
    firstNode.setProp(ELEMENT_ID, -1);
    maps[1] = undefined as unknown as number[];
    expect(() =>
      Reflect.get(second, 'emitVNodeDataScript').call(second, '1', entries, true)
    ).toThrow('Code(Q19): Serialization Error: Missing root id for segment 1');
  });

  it.each([false, true])(
    'releases segment maps after render completion or failure (%s)',
    async (fails) => {
      const { container } = createTestContainer();
      const maps = [[1]];
      Reflect.set(container, 'segmentRootIdMaps', maps);
      vi.spyOn(container, 'renderJSX').mockResolvedValue(undefined);
      let finish!: () => void;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      vi.spyOn(container, 'closeContainer').mockImplementation(async () => {
        await completion;
        if (fails) {
          throw new Error('Render failed');
        }
      });
      const rendering = container.render(null);
      expect(Reflect.get(container, 'segmentRootIdMaps')).toBe(maps);
      finish();
      if (fails) {
        await expect(rendering).rejects.toThrow('Render failed');
      } else {
        await rendering;
      }
      expect(Reflect.get(container, 'segmentRootIdMaps')).toBeNull();
    }
  );

  it('decodes segment refs around large diagonal boundaries', () => {
    const { container } = createTestContainer();
    const decode = Reflect.get(container, 'getVNodeDataOwnerFromNodeId').bind(container);
    const diagonals = [0, 1, 2, 65_536, 134_217_726];
    for (let i = 0; i < diagonals.length; i++) {
      const diagonal = diagonals[i];
      const start = (diagonal * (diagonal + 1)) / 2;
      const localIndices = [0, Math.floor(diagonal / 2), diagonal];
      for (let j = 0; j < localIndices.length; j++) {
        const localIndex = localIndices[j];
        expect(decode(String(-(start + localIndex + 1)))).toEqual({
          owner: String(diagonal - localIndex + 1),
          localIndex,
        });
      }
    }
    expect(decode(String(-Number.MAX_SAFE_INTEGER))).toEqual({
      owner: '67108866',
      localIndex: 67108862,
    });
  });

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

  it('should reject unsafe attribute names before writing markup', () => {
    const unsafeAttrNames = [
      'x onmouseover',
      'x\tonmouseover',
      'x\nonmouseover',
      'x\fonmouseover',
      'x\ronmouseover',
      'x/onmouseover',
      'x>onmouseover',
      'x=onmouseover',
      'x"onmouseover',
      "x'onmouseover",
    ];
    for (let i = 0; i < unsafeAttrNames.length; i++) {
      const { container, writer } = createTestContainer();

      expect(() =>
        container.openElement('div', null, { [unsafeAttrNames[i]]: 'value' }, null, null, null)
      ).toThrow(`Code(Q${QError.unsafeAttr})`);
      expect(writer.toString()).not.toContain('onmouseover');
    }
  });

  it('should preserve element keys in quoted attributes', async () => {
    const keys = [
      'plain',
      '42',
      'quote"key',
      'amp&key',
      '<tag>',
      "apostrophe'key",
      'white space',
      'żółć',
    ];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const { container, writer } = createTestContainer();

      container.openElement(
        'div',
        key,
        { 'data-before': 'before' },
        { 'data-after': 'after' },
        null,
        null
      );
      await container.closeElement();

      const element = createDocument({ html: writer.toString() }).querySelector('div')!;

      expect(element.getAttribute(':')).toBe(key);
      expect(element.getAttribute('data-before')).toBe('before');
      expect(element.getAttribute('data-after')).toBe('after');
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

  it('should encode the component hash when its render QRL is not a root', () => {
    const { container, writer } = createTestContainer();
    container.openContainer();
    container.serializationCtx.$roots$.push({});
    Reflect.set(container, '$noMoreRoots$', true);
    const componentHash = '</script>|{component}~';

    (container as any).vNodeDatas = [
      [
        VNodeDataFlag.SERIALIZE | VNodeDataFlag.VIRTUAL_NODE,
        { [OnRenderProp]: _createQRL(null, `s_${componentHash}`, () => undefined) },
        OPEN_FRAGMENT,
        CLOSE_FRAGMENT,
      ],
    ];

    (container as any).emitVNodeData();

    const encodedHash = encodeVNodeDataString(encodeVNodeDataKey(componentHash));
    expect(writer.toString()).toContain(`${VNodeDataChar.RENDER_FN_CHAR}_${encodedHash}`);
    expect(writer.toString()).not.toContain(`${VNodeDataChar.RENDER_FN_CHAR}_${componentHash}`);
  });

  it('should encode custom attribute names in emitVNodeData', () => {
    const { container, writer } = createTestContainer();
    container.openContainer();
    container.serializationCtx.$roots$.push({});

    const customKey = '</script><script>globalThis.__qwik_xss=1</script>';
    (container as any).vNodeDatas = [
      [
        VNodeDataFlag.SERIALIZE | VNodeDataFlag.VIRTUAL_NODE,
        { [customKey]: 'projection-ref' },
        OPEN_FRAGMENT,
        CLOSE_FRAGMENT,
      ],
    ];

    (container as any).emitVNodeData();

    const output = writer.toString();
    const encodedKey = encodeVNodeDataString(encodeVNodeDataKey(customKey));

    expect(output).not.toContain(customKey);
    expect(output).toContain(
      `${VNodeDataChar.SEPARATOR_CHAR}${encodedKey}${VNodeDataChar.SEPARATOR_CHAR}`
    );
  });

  it('should encode slot names in emitVNodeData', () => {
    const { container, writer } = createTestContainer();
    container.openContainer();
    container.serializationCtx.$roots$.push({});

    const slotName = '</script>|~;=?@ zażółć';
    (container as any).vNodeDatas = [
      [
        VNodeDataFlag.SERIALIZE | VNodeDataFlag.VIRTUAL_NODE,
        { [QSlot]: slotName },
        OPEN_FRAGMENT,
        CLOSE_FRAGMENT,
      ],
    ];

    (container as any).emitVNodeData();

    const output = writer.toString();
    const encodedSlotName = encodeVNodeDataString(encodeVNodeDataKey(slotName));

    expect(output).not.toContain(slotName);
    expect(output).toContain(
      `${VNodeDataChar.SLOT_CHAR}${VNodeDataChar.SEPARATOR_CHAR}${encodedSlotName}${VNodeDataChar.SEPARATOR_CHAR}`
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
