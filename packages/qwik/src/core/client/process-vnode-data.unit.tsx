import { describe, expect, it } from 'vitest';
import { createDocument } from '../../testing/document';
import '../../testing/vdom-diff.unit-util';
import { VNodeDataSeparator } from '../shared/vnode-data-types';
import { getDomContainer } from './dom-container';
import { processVNodeData } from './process-vnode-data';
import type { ClientContainer } from './types';

describe('processVnodeData', () => {
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
        <div q:container="html"><span></span></div>
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
          <div q:container="html"><span></span></div>
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
            <div q:container="paused">
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

const qContainerPaused = { 'q:container': 'paused' };
const qContainerHtml = { 'q:container': 'html' };
function process(html: string): ClientContainer[] {
  html = html.trim();
  html = html.replace(/\n\s*/g, '');
  // console.log(html);
  const document = createDocument({ html });
  processVNodeData(document);
  return Array.from(document.querySelectorAll('[q\\:container="paused"]')).map(getDomContainer);
}

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

function emitVNodeSeparators(lastSerializedIdx: number, elementIdx: number): string {
  let result = '';
  let skipCount = elementIdx - lastSerializedIdx;
  // console.log('emitVNodeSeparators', lastSerializedIdx, elementIdx, skipCount);
  while (skipCount != 0) {
    if (skipCount > 4096) {
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
