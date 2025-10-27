import { describe, expect, it } from 'vitest';
import { createDocument, mockAttachShadow } from '../../testing/document';
import '../../testing/vdom-diff.unit-util';
import { VNodeDataSeparator } from '../shared/vnode-data-types';
import { getDomContainer } from './dom-container';
import { processVNodeData } from './process-vnode-data';
import type { ClientContainer } from './types';
import { QContainerValue } from '../shared/types';
import { QContainerAttr } from '../shared/utils/markers';
import { vnode_getFirstChild } from './vnode';
import { Fragment } from '@qwik.dev/core';

describe('processVnodeData', () => {
  it('should process shadow root container', () => {
    const [, container] = process(`
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

  it('should parse simple case', () => {
    const [container] = process(`
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
  it('should ignore inner HTML', () => {
    const [container] = process(`
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
    const [container] = process(`
      <html q:container="paused">
        <head :></head>
        <body :>
          <div q:container="html" :><span></span></div>
          <div>ignore this</div>
          <b :>HelloWorld</b>
          ${encodeVNode({ 2: '3', 4: 'FF' })}
      </body>
      </html>
    `);
    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          <div dangerouslySetInnerHTML="<span></span>" {...qContainerHtml} />
          <div>ignore this</div>
          <b>
            {'Hello'}
            {'World'}
          </b>
        </body>
      </html>
    );
  });
  describe('nested containers', () => {
    it('should parse', () => {
      const [container1, container2] = process(`
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
    it('should ignore comments and comment blocks', () => {
      const [container1] = process(`
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
  it('should not ignore island inside comment q:container', () => {
    const [container1] = process(`
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

const qContainerPaused = { [QContainerAttr]: QContainerValue.RESUMED };
const qContainerHtml = { [QContainerAttr]: QContainerValue.HTML };
function process(html: string): ClientContainer[] {
  html = html.trim();
  html = html.replace(/\n\s*/g, '');
  // console.log(html);
  const document = createDocument({ html });
  const templates = Array.from(document.querySelectorAll('template'));
  for (const template of templates) {
    const parent = template.parentElement!;
    if (parent.hasAttribute('q:shadowroot')) {
      const content = (template as any).content;
      mockAttachShadow(parent);
      const shadowRoot = (parent as any).attachShadow({ mode: 'open' });
      shadowRoot.append(content);
      template.remove();
    }
  }
  processVNodeData(document);

  const containers: Element[] = [];
  findContainers(document, containers);

  return containers.map(getDomContainer);
}

const findContainers = (element: Document | ShadowRoot, containers: Element[]) => {
  Array.from(element.querySelectorAll('[q\\:container]')).forEach((container) => {
    containers.push(container);
  });
  element.querySelectorAll('[q\\:shadowroot]').forEach((parent) => {
    const shadowRoot = parent.shadowRoot;
    shadowRoot && findContainers(shadowRoot, containers);
  });
};

function encodeVNode(data: Record<number, string> = {}) {
  const keys = Object.keys(data)
    .map((key) => parseInt(key, 10))
    .sort();
  let result = '';
  let idx = 0;
  for (const key of keys) {
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
