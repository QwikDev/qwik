import { describe, expect, it } from 'vitest';
import { createDocument, mockAttachShadow } from '../../testing/document';
import '../../testing/vdom-diff.unit-util';
import { VNodeDataSeparator, getSegmentVNodeRefId } from '../shared/vnode-data-types';
import { getDomContainer } from './dom-container';
import {
  findVDataSectionEnd,
  processOutOfOrderSegmentVNodeData,
  processVNodeData,
} from './process-vnode-data';
import type { ClientContainer, QDocument } from './types';
import { QContainerValue } from '../shared/types';
import { QContainerAttr } from '../shared/utils/markers';
import { vnode_getFirstChild } from './vnode-utils';
import { Fragment } from '@qwik.dev/core';
import { installOutOfOrderExecutor } from '../../out-of-order-executor-shared';

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
  it('should add suspense content segment elements to the root vnode table', () => {
    const [container] = process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          <h1 :>Title</h1>
          <div : style="display:none"><p :>Loading</p></div>
          <div : q:rp="1" style="display:contents"><section :><button :>OK</button></section></div>
          ${encodeVNode({ 6: '~' })}
          ${encodeVNode({ 0: '~{1}', 1: '~', 2: '~' }, '1')}
          <footer :>Footer</footer>
        </body>
      </html>`);

    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          <h1>Title</h1>
          <div style="display:none">
            <p>Loading</p>
          </div>
          <div {...{ 'q:rp': '1' }} style="display:contents">
            <Fragment>
              <section>
                <button>OK</button>
              </section>
            </Fragment>
          </div>
          <footer>Footer</footer>
        </body>
      </html>
    );
    expect(container.vNodeLocate(`6A`)).toMatchVDOM(
      <Fragment>
        <section>
          <button>OK</button>
        </section>
      </Fragment>
    );
    expect(container.vNodeLocate(`${getSegmentVNodeRefId('1', 1)}`)).toMatchVDOM(
      <section>
        <button>OK</button>
      </section>
    );
    expect(container.vNodeLocate(`${getSegmentVNodeRefId('1', 2)}`)).toMatchVDOM(
      <button>OK</button>
    );
  });
  it('should materialize suspense content host from DOM when segment data starts at child', () => {
    const [container] = process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          <h1 :>Title</h1>
          <div : q:rp="1" style="display:contents"><section :><button :>OK</button></section></div>
          ${encodeVNode({ 4: '~||=1||' })}
          ${encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1')}
        </body>
      </html>`);

    expect(container.vNodeLocate(`4AA`)).toMatchVDOM(
      <section>
        <button>OK</button>
      </section>
    );
  });
  it('should keep suspense result parent available as a root vnode ref', () => {
    const [container] = process(`
      <html q:container="paused" :>
          <head :></head>
          <body :>
          <div : q:rp="1" style="display:contents"><section :><button :>OK</button></section></div>
          ${encodeVNode({ 3: '~' })}
          ${encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1')}
        </body>
      </html>`);
    const resultParent = container.element.querySelector('[q\\:rp="1"]')!;
    const section = resultParent.querySelector('section')!;

    expect(container.element.qVNodeRefs?.get(3)).toBe(resultParent);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect((resultParent as any)._qSegment).toBeUndefined();
    expect((section as any)._qSegment).toBe('1');
    const rootHostVNode = container.vNodeLocate('3');
    expect(rootHostVNode).toMatchVDOM(
      <div {...{ 'q:rp': '1' }} style="display:contents">
        <Fragment>
          <section>
            <button>OK</button>
          </section>
        </Fragment>
      </div>
    );
  });
  it('should not cache empty children for a suspense placeholder-only result parent', () => {
    const [container] = process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          <div : q:rp="1" style="display:none"><template q:r="1"></template></div>
        </body>
      </html>`);
    const resultParent = container.element.querySelector('[q\\:rp]')!;
    const resultParentVNode = container.vNodeLocate(resultParent);

    expect(vnode_getFirstChild(resultParentVNode)).toBeNull();
    expect((resultParentVNode as any).firstChild).toBeUndefined();

    resultParent.innerHTML = '<section :><button :>OK</button></section>';
    expect(vnode_getFirstChild(resultParentVNode)).toMatchVDOM(
      <section>
        <button>OK</button>
      </section>
    );
  });
  it('should merge suspense content segment refs into the root vnode table by segment id', () => {
    const [container] = process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          <h1 :>Title</h1>
          <div : style="display:none"><p :>Loading</p></div>
          <div : q:rp="1" style="display:contents"><section :><button :>OK</button></section></div>
          ${encodeVNode({ 1: '~', 2: '~' }, '1', 8)}
          <footer :>Footer</footer>
        </body>
      </html>`);

    expect(container.vNodeLocate(`${getSegmentVNodeRefId('1', 1)}`)).toMatchVDOM(
      <section>
        <button>OK</button>
      </section>
    );
    expect(container.vNodeLocate(`${getSegmentVNodeRefId('1', 2)}`)).toMatchVDOM(
      <button>OK</button>
    );
  });
  it('should process suspense content segment vnode data on the content host', () => {
    const [container] = process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          <h1 :>Title</h1>
          <div : style="display:none"><p :>Loading</p></div>
          <div : q:rp="1" style="display:contents">HelloWorld</div>
          ${encodeVNode({ 0: 'FF' }, '1')}
          <footer :>Footer</footer>
        </body>
      </html>`);

    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          <h1>Title</h1>
          <div style="display:none">
            <p>Loading</p>
          </div>
          <div {...{ 'q:rp': '1' }} style="display:contents">
            {'Hello'}
            {'World'}
          </div>
          <footer>Footer</footer>
        </body>
      </html>
    );
  });
  it('should process suspense content segment vnode data for nested text', () => {
    const [container] = process(`
      <html q:container="paused" :>
        <head :></head>
        <body :>
          <h1 :>Title</h1>
          <div : style="display:none"><p :>Loading</p></div>
          <div : q:rp="1" style="display:contents"><section :><p :>HelloWorld</p></section></div>
          ${encodeVNode({ 2: 'FF' }, '1')}
          <footer :>Footer</footer>
        </body>
      </html>`);

    expect(container.rootVNode).toMatchVDOM(
      <html {...qContainerPaused}>
        <head />
        <body>
          <h1>Title</h1>
          <div style="display:none">
            <p>Loading</p>
          </div>
          <div {...{ 'q:rp': '1' }} style="display:contents">
            <section>
              <p>
                {'Hello'}
                {'World'}
              </p>
            </section>
          </div>
          <footer>Footer</footer>
        </body>
      </html>
    );
  });
  it('should process only requested suspense content segment vnode data', () => {
    const document = createDocument({
      html: `
        <html q:container="paused" :>
          <head :></head>
          <body :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>One</button></section>
            </div>
            <div : q:rp="2" style="display:contents">
              <section :><button :>Two</button></section>
            </div>
            ${encodeVNode()}
          </body>
        </html>`,
    });
    processVNodeData(document);
    const containerElement = document.querySelector('[q\\:container]')!;
    const container = getDomContainer(containerElement);
    document.body.insertAdjacentHTML(
      'beforeend',
      encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1') +
        encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '2')
    );

    processOutOfOrderSegmentVNodeData(
      document,
      '2',
      container.element.querySelector('[q\\:rp="2"]')
    );

    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 1))).toBe(false);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('2', 0))).toBe(false);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('2', 1))).toBe(true);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('2', 2))).toBe(true);
  });
  it('should process requested suspense segment only within the provided container scope', () => {
    const document = createDocument({
      html: `
        <main>
          <div id="first" q:container="paused" :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>One</button></section>
            </div>
            ${encodeVNode()}
          </div>
          <div id="second" q:container="paused" :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>Two</button></section>
            </div>
            ${encodeVNode()}
          </div>
        </main>`,
    });
    processVNodeData(document);
    const first = getDomContainer(document.querySelector('#first')!);
    const second = getDomContainer(document.querySelector('#second')!);
    first.element.insertAdjacentHTML('beforeend', encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1'));
    second.element.insertAdjacentHTML('beforeend', encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1'));

    processOutOfOrderSegmentVNodeData(document, '1', first.element.querySelector('[q\\:rp="1"]'));

    expect(first.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect(first.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 1))).toBe(true);
    expect(first.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 2))).toBe(true);
    expect(second.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect(second.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 1))).toBe(false);
    expect(second.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 2))).toBe(false);
  });
  it('should scope out-of-order vnode processing to the current script container', () => {
    const document = createDocument({
      html: `
        <main>
          <div id="first" q:container="paused" :>
            <div : q:rp="1" style="display:contents"><template q:r="1"></template></div>
            ${encodeVNode()}
            ${encodeVNode({ 0: '{1}', 1: '~' }, '1')}
            <template q:r="1"><section : id="first-done">First</section></template>
            <script type="text/javascript" id="first-qo"></script>
          </div>
          <div id="second" q:container="paused" :>
            <div : q:rp="1" style="display:contents"><template q:r="1"></template></div>
            ${encodeVNode()}
            ${encodeVNode({ 0: '{1}', 1: '~' }, '1')}
            <template q:r="1"><section : id="second-done">Second</section></template>
            <script type="text/javascript" id="second-qo"></script>
          </div>
        </main>`,
    });
    processVNodeData(document);
    const first = getDomContainer(document.querySelector('#first')!);
    const second = getDomContainer(document.querySelector('#second')!);
    const processedContainers: string[] = [];
    (document as QDocument).qProcessOOOS = (boundaryId, content) => {
      processedContainers.push(content?.closest('[q\\:container]')?.id || '');
      processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
    };
    installOutOfOrderExecutor(document);

    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      value: document.querySelector('#second-qo'),
    });
    (globalThis as any).qO(1);
    Object.defineProperty(document, 'currentScript', { configurable: true, value: null });

    expect(first.element.querySelector('#first-done')).toBeFalsy();
    expect(second.element.querySelector('#second-done')).not.toBeNull();
    expect(processedContainers).toEqual(['second']);
    expect(second.element.qVNodeRefs?.get(getSegmentVNodeRefId('1', 1))).toBe(
      second.element.querySelector('#second-done')
    );
  });
  it('should process segment vnode patches during out-of-order segment processing', () => {
    const document = createDocument({
      html: `
        <html q:container="paused" :>
          <head :></head>
          <body :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>One</button></section>
            </div>
            ${encodeVNode()}
          </body>
        </html>`,
    });
    processVNodeData(document);
    const container = getDomContainer(document.querySelector('[q\\:container]')!);
    container.element.insertAdjacentHTML(
      'beforeend',
      encodeVNode({ 0: '{1}', 1: '~' }, '1') + encodeVNode({ 2: '~' }, '1', 0, true)
    );

    processOutOfOrderSegmentVNodeData(
      document,
      '1',
      container.element.querySelector('[q\\:rp="1"]')
    );

    const button = container.element.querySelector('button');
    expect(container.element.qVNodeRefs?.get(getSegmentVNodeRefId('1', 1))).toBe(
      container.element.querySelector('section')
    );
    expect(container.element.qVNodeRefs?.get(getSegmentVNodeRefId('1', 2))).toBe(button);
  });
  it('should process root vnode data patches for previously skipped entries', () => {
    const document = createDocument({
      html: `
        <html q:container="paused" :>
          <head :></head>
          <body :>
            <main :><span :>Count</span></main>
            ${encodeVNode()}
          </body>
        </html>`,
    });
    processVNodeData(document);
    const container = getDomContainer(document.querySelector('[q\\:container]')!);
    appendVNodePatch(container.element, encodeVNode({ 4: '~' }, undefined, 0, true));

    expect(container.element.qVNodeRefs?.has(4)).toBe(true);
  });
  it('should process segment vnode data patches for previously emitted segment entries', () => {
    const document = createDocument({
      html: `
        <html q:container="paused" :>
          <head :></head>
          <body :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>One</button></section>
            </div>
            ${encodeVNode()}
          </body>
        </html>`,
    });
    processVNodeData(document);
    const container = getDomContainer(document.querySelector('[q\\:container]')!);
    appendVNodePatch(container.element, encodeVNode({ 1: '~' }, '1', 0, true));

    const refId = getSegmentVNodeRefId('1', 1);
    const refElement = container.element.qVNodeRefs?.get(refId);
    (document as QDocument).qProcessVNodeDataPatch!(container.element.lastElementChild);

    expect(refElement).toBeTruthy();
    expect(container.element.qVNodeRefs?.get(refId)).toBe(refElement);
  });
  it('should scope vnode data patches to their script container', () => {
    const document = createDocument({
      html: `
        <main>
          <div id="first" q:container="paused" :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>One</button></section>
            </div>
            ${encodeVNode()}
          </div>
          <div id="second" q:container="paused" :>
            <div : q:rp="1" style="display:contents">
              <section :><button :>Two</button></section>
            </div>
            ${encodeVNode()}
          </div>
        </main>`,
    });
    processVNodeData(document);
    const first = getDomContainer(document.querySelector('#first')!);
    const second = getDomContainer(document.querySelector('#second')!);
    appendVNodePatch(first.element, encodeVNode({ 1: '~' }, '1', 0, true));
    appendVNodePatch(second.element, encodeVNode({ 1: '~' }, '1', 0, true));

    const refId = getSegmentVNodeRefId('1', 1);
    expect(first.element.qVNodeRefs?.get(refId)).toBe(first.element.querySelector('section'));
    expect(second.element.qVNodeRefs?.get(refId)).toBe(second.element.querySelector('section'));
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

const qContainerPaused = { [QContainerAttr]: QContainerValue.RESUMED };
const qContainerHtml = { [QContainerAttr]: QContainerValue.HTML };
function process(html: string): ClientContainer[] {
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
  processVNodeData(document);

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

function encodeVNode(
  data: Record<number, string> = {},
  segment?: string,
  offset?: number,
  patch?: boolean
) {
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

  return `<script type="qwik/vnode"${segment ? ` q:r="${segment}"` : ''}${
    offset ? ` q:o="${offset}"` : ''
  }${patch ? ' q:patch' : ''}>${result}</script>`;
}

function appendVNodePatch(target: Element, html: string) {
  target.insertAdjacentHTML('beforeend', html);
  const script = target.lastElementChild as Element;
  (target.ownerDocument as QDocument).qProcessVNodeDataPatch?.(script);
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
