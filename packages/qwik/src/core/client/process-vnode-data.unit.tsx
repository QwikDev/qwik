import { describe, expect, it } from 'vitest';
import { createDocument, mockAttachShadow } from '../../testing/document';
import '../../testing/vdom-diff.unit-util';
import { VNodeDataSeparator } from '../shared/vnode-data-types';
import { getDomContainer } from './dom-container';
import { findVDataSectionEnd, processVNodeData, whenVNodeDataReady } from './process-vnode-data';
import type { ClientContainer, ContainerElement, QDocument } from './types';
import { QContainerValue } from '../shared/types';
import { QContainerAttr, QStyle } from '../shared/utils/markers';
import { vnode_getFirstChild } from './vnode-utils';
import { Fragment } from '@qwik.dev/core';

describe('processVnodeData', () => {
  it('should yield over multiple chunks and preserve vnode data and refs', async () => {
    const document = createDocument({
      html: `
        <html q:container="paused">
          <head :></head>
          <body :>
            HelloWorld
            <script type="qwik/vnode">${VNodeDataSeparator.ADVANCE_2_CH}${VNodeDataSeparator.REFERENCE_CH}FF</script>
            ${'<span :></span>'.repeat(64)}
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const ready = whenVNodeDataReady(document, () => undefined);

      processVNodeData(document);

      expect(document.qVNodeDataStarted).toBe(true);
      expect(document.qVNodeDataReady).not.toBe(true);
      expect(tasks.length).toBe(1);

      let chunks = 0;
      while (!document.qVNodeDataReady) {
        runNextTask(tasks);
        chunks++;
        expect(chunks).toBeLessThan(50);
      }

      await ready;
      expect(document.qVNodeDataCallbacks).toBeUndefined();
      expect(chunks).toBeGreaterThan(1);
      expect(document.qVNodeData.get(document.body)).toBe('FF');
      expect((document.documentElement as ContainerElement).qVNodeRefs?.get(2)).toBe(document.body);
    });
  });

  it('should finish resume and hoist styles only after vnode data is ready', async () => {
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="">
          <head :></head>
          <body :>
            <style : ${QStyle}="style-a">.a{color:red}</style>
            <script type="qwik/vnode"></script>
          </body>
        </html>
      `,
    }) as QDocument;
    const style = document.body.querySelector('style')!;

    await withYieldingVNodeData(document, async (tasks) => {
      getDomContainer(document.documentElement);

      expect(document.qVNodeDataReady).not.toBe(true);
      expect(document.head.contains(style)).toBe(false);
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.PAUSED);

      while (!document.qVNodeDataReady) {
        runNextTask(tasks);
      }

      expect(document.head.contains(style)).toBe(true);
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.RESUMED);
    });
  });

  it('should process shadow root container', async () => {
    const [, container] = await process(`
      <html q:container="paused">
        <head :></head>
        <body :>
          <div q:shadowRoot>
            <template>
              <div q:container="paused">
                <button :>
                  0
                </button>
                <script : type="qwik/vnode">
                  ~{1}!~
                </script>
              </div>
            </template>
          </div>
        </body>
      </html>
    `);
    vnode_getFirstChild(container.rootVNode);
    expect(container.rootVNode).toMatchVDOM(
      <div {...qContainerPaused}>
        <Fragment>
          <button>0</button>
        </Fragment>
      </div>
    );
  });

  it('should parse simple case', async () => {
    const [container] = await process(`
      <html q:container="paused">
        <head :></head>
        <body :>
          HelloWorld
          ${encodeVNode({ 2: 'FF' })}
        </body>
      </html>
    `);
    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          {'Hello'}
          {'World'}
        </body>
      </html>
    );
  });
  it('should ignore inner HTML', async () => {
    const [container] = await process(`
    <html q:container="paused">
      <head :></head>
      <body :>
        <div q:container="html" :><span></span></div>
        <b :>HelloWorld</b>
        ${encodeVNode({ 2: '2', 4: 'FF' })}
    </body>
    </html>
  `);
    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          <div dangerouslySetInnerHTML="<span></span>" {...qContainerHtml} />
          <b>
            {'Hello'}
            {'World'}
          </b>
        </body>
      </html>
    );
  });

  it('should ignore elements without `:`', async () => {
    const [container] = await process(`
      <html q:container="paused">
        <head :></head>
        <body :>
          <div q:container="html" :><span></span></div>
          <div>ignore this</div>
          <b :>HelloWorld</b>
          ${encodeVNode({ 2: '2', 4: 'FF' })}
      </body>
      </html>
    `);
    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          <div dangerouslySetInnerHTML="<span></span>" {...qContainerHtml} />
          <b>
            {'Hello'}
            {'World'}
          </b>
        </body>
      </html>
    );
  });
  describe('nested containers', () => {
    it('should parse', async () => {
      const [container1, container2] = await process(`
        <html q:container="paused">
          <head :></head>
          <body :>
            Before
            <div q:container="paused" :>
              Foo<b :>Bar!</b>
              ${encodeVNode({ 0: 'D1', 1: 'DB' })}
            </div>
            <b :>After!</b>
            ${encodeVNode({ 2: 'G2', 4: 'FB' })}
          </body>
        </html>`);
      expect(container1.rootVNode).toMatchVDOM(
        <html {...qContainerPaused}>
          <head />
          <body>
            {'Before'}
            <div {...qContainerPaused} />
            <b>
              {'After'}
              {'!'}
            </b>
          </body>
        </html>
      );
      expect(container2.rootVNode).toMatchVDOM(
        <div {...qContainerPaused}>
          {'Foo'}
          <b>
            {'Bar'}
            {'!'}
          </b>
        </div>
      );
    });
    it('should ignore comments and comment blocks', async () => {
      const [container1] = await process(`
        <html q:container="paused" :>
          <head :></head>
          <body :>
            <!-- comment -->
            Before
            <!--q:container=some-id-->
              Foo<i>Bar!</i>
            <!--/q:container-->
            <b :>After!</b>
            ${encodeVNode({ 2: 'G1', 3: 'FB' })}
          </body>
        </html>`);
      expect(container1.rootVNode).toMatchVDOM(
        <html {...qContainerPaused}>
          <head />
          <body>
            {'Before'}
            <b>
              {'After'}
              {'!'}
            </b>
          </body>
        </html>
      );
    });
  });
  it('should not ignore island inside comment q:container', async () => {
    const [container1] = await process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          Before
          <!--q:ignore=abc-->
            Foo<i>Bar!</i>
            <!--q:container-island=some-id-2-->
              <button :>Click</button>
            <!--/q:container-island-->
            Abcd<b>Abcd!</b>
          <!--/q:ignore-->
          <b :>After!</b>
          ${encodeVNode({ 2: 'G2', 4: 'FB' })}
        </body>
      </html>`);
    expect(container1.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          {'Before'}
          <button>Click</button>
          <b>
            {'After'}
            {'!'}
          </b>
        </body>
      </html>
    );
  });
});

describe('emitVNodeSeparators', () => {
  it('should encode binary correctly', () => {
    expect(emitVNodeSeparators(0, 1)).toBe(VNodeDataSeparator.ADVANCE_1_CH);
    expect(emitVNodeSeparators(0, 2)).toBe(VNodeDataSeparator.ADVANCE_2_CH);
    expect(emitVNodeSeparators(0, 4)).toBe(VNodeDataSeparator.ADVANCE_4_CH);
    expect(emitVNodeSeparators(0, 8)).toBe(VNodeDataSeparator.ADVANCE_8_CH);
    expect(emitVNodeSeparators(0, 16)).toBe(VNodeDataSeparator.ADVANCE_16_CH);
    expect(emitVNodeSeparators(0, 32)).toBe(VNodeDataSeparator.ADVANCE_32_CH);
    expect(emitVNodeSeparators(0, 64)).toBe(VNodeDataSeparator.ADVANCE_64_CH);
    expect(emitVNodeSeparators(0, 128)).toBe(VNodeDataSeparator.ADVANCE_128_CH);
    expect(emitVNodeSeparators(0, 256)).toBe(VNodeDataSeparator.ADVANCE_256_CH);
    expect(emitVNodeSeparators(0, 512)).toBe(VNodeDataSeparator.ADVANCE_512_CH);
    expect(emitVNodeSeparators(0, 1024)).toBe(VNodeDataSeparator.ADVANCE_1024_CH);
    expect(emitVNodeSeparators(0, 2048)).toBe(VNodeDataSeparator.ADVANCE_2048_CH);
    expect(emitVNodeSeparators(0, 4096)).toBe(VNodeDataSeparator.ADVANCE_4096_CH);
    expect(emitVNodeSeparators(0, 8192)).toBe(VNodeDataSeparator.ADVANCE_8192_CH);
  });
  it('should encode combinations correctly', () => {
    expect(emitVNodeSeparators(0, 3)).toBe(
      VNodeDataSeparator.ADVANCE_2_CH + VNodeDataSeparator.ADVANCE_1_CH
    );
    expect(emitVNodeSeparators(0, 7)).toBe(
      VNodeDataSeparator.ADVANCE_4_CH +
        VNodeDataSeparator.ADVANCE_2_CH +
        VNodeDataSeparator.ADVANCE_1_CH
    );
    expect(emitVNodeSeparators(0, 15)).toBe(
      VNodeDataSeparator.ADVANCE_8_CH +
        VNodeDataSeparator.ADVANCE_4_CH +
        VNodeDataSeparator.ADVANCE_2_CH +
        VNodeDataSeparator.ADVANCE_1_CH
    );
    expect(emitVNodeSeparators(0, 4097)).toBe(
      VNodeDataSeparator.ADVANCE_4096_CH + VNodeDataSeparator.ADVANCE_1_CH
    );
    expect(emitVNodeSeparators(0, 8193)).toBe(
      VNodeDataSeparator.ADVANCE_8192_CH + VNodeDataSeparator.ADVANCE_1_CH
    );
    expect(emitVNodeSeparators(0, 16385)).toBe(
      VNodeDataSeparator.ADVANCE_8192_CH +
        VNodeDataSeparator.ADVANCE_8192_CH +
        VNodeDataSeparator.ADVANCE_1_CH
    );
  });
});
describe('findVDataSectionEnd', () => {
  it('should find the end of the VNodeData section with encoded separators', () => {
    const vData =
      '|||aria\\-labelledby|34`32=82||{{1||13A`33=5@i8_1<35[36^37||q:type|C}E|q:type|P?10AB~}';
    expect(findVDataSectionEnd(vData, 0, vData.length)).toBe(vData.length);
  });
});

async function withYieldingVNodeData(
  document: Document,
  callback: (tasks: Array<() => void>) => Promise<void>
) {
  const tasks: Array<() => void> = [];
  const originalWindow = (globalThis as any).window;
  const originalDocument = (globalThis as any).document;
  const originalCustomEvent = (globalThis as any).CustomEvent;
  const originalMessageChannel = (globalThis as any).MessageChannel;
  const originalPerformance = (globalThis as any).performance;
  let time = 0;

  class TestMessageChannel {
    port1 = {
      onmessage: null as null | (() => void),
      close() {},
    };
    port2 = {
      postMessage: () => {
        tasks.push(() => this.port1.onmessage?.());
      },
      close() {},
    };
  }

  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { document },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: document,
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: TestMessageChannel,
    });
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: {
        now: () => {
          time += 20;
          return time;
        },
      },
    });

    await callback(tasks);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: originalCustomEvent,
    });
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: originalMessageChannel,
    });
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance,
    });
  }
}

function runNextTask(tasks: Array<() => void>) {
  const task = tasks.shift();
  expect(task).toBeDefined();
  task!();
}

const qContainerPaused = { [QContainerAttr]: QContainerValue.RESUMED };
const qContainerHtml = { [QContainerAttr]: QContainerValue.HTML };
async function process(html: string): Promise<ClientContainer[]> {
  html = html.trim();
  html = html.replace(/\n\s*/g, '');
  // console.log(html);
  const document = createDocument({ html });
  const templates = Array.from(document.querySelectorAll('template'));
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const parent = template.parentElement!;
    if (parent.hasAttribute('q:shadowroot')) {
      const content = (template as any).content;
      mockAttachShadow(parent);
      const shadowRoot = (parent as any).attachShadow({ mode: 'open' });
      shadowRoot.append(content);
      template.remove();
    }
  }
  const ready = whenVNodeDataReady(document, () => undefined);
  processVNodeData(document);
  await ready;

  const containers: Element[] = [];
  findContainers(document, containers);

  return containers.map(getDomContainer);
}

const findContainers = (element: Document | ShadowRoot, containers: Element[]) => {
  const qContainerElements = element.querySelectorAll('[q\\:container]');
  for (let i = 0; i < qContainerElements.length; i++) {
    const container = qContainerElements[i];
    containers.push(container);
  }
  const shadowRoots = element.querySelectorAll('[q\\:shadowroot]');
  for (let i = 0; i < shadowRoots.length; i++) {
    const parent = shadowRoots[i];
    const shadowRoot = parent.shadowRoot;
    shadowRoot && findContainers(shadowRoot, containers);
  }
};

function encodeVNode(data: Record<number, string> = {}) {
  const keys = Object.keys(data)
    .map((key) => parseInt(key, 10))
    .sort();
  let result = '';
  let idx = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    result += emitVNodeSeparators(idx, key) + data[key];
    idx = key;
  }

  return `<script type="qwik/vnode">${result}</script>`;
}

// Keep in sync with ssr-container.ts
function emitVNodeSeparators(lastSerializedIdx: number, elementIdx: number): string {
  let result = '';
  let skipCount = elementIdx - lastSerializedIdx;
  // console.log('emitVNodeSeparators', lastSerializedIdx, elementIdx, skipCount);
  while (skipCount != 0) {
    if (skipCount >= 8192) {
      result += VNodeDataSeparator.ADVANCE_8192_CH;
      skipCount -= 8192;
    } else {
      skipCount & 4096 && (result += VNodeDataSeparator.ADVANCE_4096_CH);
      skipCount & 2048 && (result += VNodeDataSeparator.ADVANCE_2048_CH);
      skipCount & 1024 && (result += VNodeDataSeparator.ADVANCE_1024_CH);
      skipCount & 512 && (result += VNodeDataSeparator.ADVANCE_512_CH);
      skipCount & 256 && (result += VNodeDataSeparator.ADVANCE_256_CH);
      skipCount & 128 && (result += VNodeDataSeparator.ADVANCE_128_CH);
      skipCount & 64 && (result += VNodeDataSeparator.ADVANCE_64_CH);
      skipCount & 32 && (result += VNodeDataSeparator.ADVANCE_32_CH);
      skipCount & 16 && (result += VNodeDataSeparator.ADVANCE_16_CH);
      skipCount & 8 && (result += VNodeDataSeparator.ADVANCE_8_CH);
      skipCount & 4 && (result += VNodeDataSeparator.ADVANCE_4_CH);
      skipCount & 2 && (result += VNodeDataSeparator.ADVANCE_2_CH);
      skipCount & 1 && (result += VNodeDataSeparator.ADVANCE_1_CH);
      skipCount = 0;
    }
  }
  return result;
}
