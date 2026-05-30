import { describe, expect, it } from 'vitest';
import { createDocument, mockAttachShadow } from '../../testing/document';
import '../../testing/vdom-diff.unit-util';
import { VNodeDataSeparator, getSegmentVNodeRefId } from '../shared/vnode-data-types';
import { DomContainer, getDomContainer } from './dom-container';
import {
  findVDataSectionEnd,
  processOutOfOrderSegmentVNodeData,
  processVNodeData,
  whenVNodeDataReady,
} from './process-vnode-data';
import type { ClientContainer, ContainerElement, QDocument } from './types';
import { QContainerValue } from '../shared/types';
import { QContainerAttr, QStatePrewarmAttr, QStyle } from '../shared/utils/markers';
import { vnode_getFirstChild } from './vnode-utils';
import { Fragment } from '@qwik.dev/core';
import { TypeIds } from '../shared/serdes/constants';
import { ContainerDataProcessState, isContainerReady } from './process-container-state-utils';
import { whenContainerDataReady } from './process-state-data';
import { installOutOfOrderExecutor } from '../../out-of-order-executor-shared';

describe('processVnodeData', () => {
  it('should finish empty container data after state processing', async () => {
    const document = createDocument() as QDocument;
    document.body.setAttribute(QContainerAttr, QContainerValue.RESUMED);

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.body) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);

      expect(container.$containerDataProcessState$).toBe(ContainerDataProcessState.ProcessingVNode);
      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }

      await ready;
      expect(isContainerReady(container)).toBe(true);
    });
  });

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
      const container = getDomContainer(document.body) as DomContainer;
      const ready = whenVNodeDataReady(document, () => undefined);

      expect(container.$containerDataProcessState$).toBe(ContainerDataProcessState.ProcessingVNode);
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

  it('should yield while processing out-of-order segment vnode data', async () => {
    const document = createDocument({
      html: `
        <html q:container="paused">
          <head :></head>
          <body :>
            <div : q:rp="1" style="display:contents">
              ${'<span :></span>'.repeat(64)}
            </div>
            ${encodeVNode()}
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      while (!document.qVNodeDataReady) {
        runNextTask(tasks);
      }
      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }

      container.element.insertAdjacentHTML('beforeend', encodeVNode({ 64: '~' }, '1'));

      processOutOfOrderSegmentVNodeData(
        document,
        '1',
        container.element.querySelector('[q\\:rp="1"]')
      );
      const ready = whenVNodeDataReady(document, () => undefined);

      expect(document.qVNodeDataReady).not.toBe(true);
      expect(tasks.length).toBe(1);

      let chunks = 0;
      while (!document.qVNodeDataReady) {
        runNextTask(tasks);
        chunks++;
        expect(chunks).toBeLessThan(50);
      }

      await ready;
      expect(chunks).toBeGreaterThan(1);
      expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 64))).toBe(true);
    });
  });

  it('should yield while processing out-of-order segment state patches', async () => {
    const patchState: unknown[] = [];
    for (let i = 0; i < 128; i++) {
      patchState.push(TypeIds.Plain, i);
    }
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="">
          <head :></head>
          <body :>
            <div : q:rp="1" style="display:contents">
              ${'<span :></span>'.repeat(8)}
              <template q:r="1"></template>
            </div>
            ${encodeVNode()}
            <script type="qwik/state" q:instance="">[]</script>
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      const initialReady = whenContainerDataReady(container, () => undefined);
      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }
      await initialReady;

      container.element.insertAdjacentHTML(
        'beforeend',
        encodeVNode({ 8: '~' }, '1') +
          `<script type="qwik/state" q:instance="" q:patch q:r="1">${JSON.stringify([
            0,
            patchState,
            0,
          ])}</script>`
      );
      document.qProcessOOOS!(1, container.element.querySelector('[q\\:rp="1"]'));
      const ready = whenContainerDataReady(container, () => undefined);

      expect(document.qVNodeDataReady).not.toBe(true);
      while (!document.qVNodeDataReady) {
        runNextTask(tasks);
      }
      expect(isContainerReady(container)).not.toBe(true);

      let chunks = 0;
      while (!isContainerReady(container)) {
        runNextTask(tasks);
        chunks++;
        expect(chunks).toBeLessThan(50);
      }

      await ready;
      expect(chunks).toBeGreaterThan(1);
      expect(container.$getObjectById$(127)).toBe(127);
    });
  });

  it('should finish resume and hoist styles only after container data is ready', async () => {
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
      const container = getDomContainer(document.documentElement) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);

      expect(container.$containerDataProcessState$).not.toBe(
        ContainerDataProcessState.ProcessingVNodeDone
      );
      expect(document.head.contains(style)).toBe(false);
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.PAUSED);

      while (
        container.$containerDataProcessState$ < ContainerDataProcessState.ProcessingVNodeDone
      ) {
        runNextTask(tasks);
      }

      expect(isContainerReady(container)).not.toBe(true);
      expect(document.head.contains(style)).toBe(false);
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.PAUSED);

      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }

      await ready;
      expect(document.head.contains(style)).toBe(true);
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.RESUMED);
    });
  });

  it('should yield while preprocessing container state without eager deserialization', async () => {
    const stateItems: unknown[] = [TypeIds.VNode, '4'];
    for (let i = 0; i < 128; i++) {
      stateItems.push(TypeIds.Plain, i);
    }
    const stateData = JSON.stringify(stateItems);
    const vData =
      emitVNodeSeparators(0, 2) +
      'G2' +
      emitVNodeSeparators(2, 4) +
      VNodeDataSeparator.REFERENCE_CH +
      emitVNodeSeparators(4, 5) +
      'FB';
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="">
          <head :></head>
          <body :>
            <!--q:ignore=abc-->
              <section>
                <div>
                  <!--q:container-island=some-id-2-->
                    <span :><button :>Click</button></span>
                  <!--/q:container-island-->
                </div>
              </section>
            <!--/q:ignore-->
            <b :>After!</b>
            <script type="qwik/vnode">${vData}</script>
            <script type="qwik/state">${stateData}</script>
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);

      while (
        container.$containerDataProcessState$ < ContainerDataProcessState.ProcessingVNodeDone
      ) {
        runNextTask(tasks);
      }

      expect(isContainerReady(container)).not.toBe(true);
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.PAUSED);

      let chunks = 0;
      while (!isContainerReady(container)) {
        runNextTask(tasks);
        chunks++;
        expect(chunks).toBeLessThan(50);
      }

      await ready;
      expect(chunks).toBeGreaterThan(1);
      expect(container.$getObjectById$(1)).toBe(0);
      expect((document.documentElement as ContainerElement).qVNodeRefs?.get(4)).toBe(
        document.querySelector('button')
      );
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.RESUMED);
    });
  });

  it('should keep below-threshold state lazy until first access', async () => {
    const stateItems: unknown[] = [TypeIds.Object, [TypeIds.Plain, 'answer', TypeIds.Plain, 42]];
    for (let i = 1; i < 128; i++) {
      stateItems.push(TypeIds.Plain, i);
    }
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="">
          <head :></head>
          <body :>
            <script type="qwik/state">${JSON.stringify(stateItems)}</script>
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);

      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }

      await ready;
      const rawState = (container as any).$rawStateData$ as unknown[];
      expect(rawState[0]).toBe(TypeIds.Object);
      expect(container.$getObjectById$(0)).toEqual({ answer: 42 });
      expect(rawState[0]).toBe(TypeIds.Plain);
    });
  });

  it('should eagerly deserialize opted-in large state before marking the container resumed', async () => {
    const stateItems: unknown[] = [TypeIds.Object, [TypeIds.Plain, 'answer', TypeIds.Plain, 42]];
    for (let i = 1; i < 2048; i++) {
      stateItems.push(TypeIds.Plain, i);
    }
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="" ${QStatePrewarmAttr}="2048">
          <head :></head>
          <body :>
            <script type="qwik/state">${JSON.stringify(stateItems)}</script>
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);
      let chunks = 0;

      while (!isContainerReady(container)) {
        expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.PAUSED);
        runNextTask(tasks);
        chunks++;
        expect(chunks).toBeLessThan(300);
      }

      await ready;
      const rawState = (container as any).$rawStateData$ as unknown[];
      expect(chunks).toBeGreaterThan(1);
      expect(rawState[0]).toBe(TypeIds.Plain);
      expect(container.$getObjectById$(0)).toEqual({ answer: 42 });
      expect(document.documentElement.getAttribute(QContainerAttr)).toBe(QContainerValue.RESUMED);
    });
  });

  it('should keep large state lazy by default', async () => {
    const stateItems: unknown[] = [TypeIds.Object, [TypeIds.Plain, 'answer', TypeIds.Plain, 42]];
    for (let i = 1; i < 2048; i++) {
      stateItems.push(TypeIds.Plain, i);
    }
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="">
          <head :></head>
          <body :>
            <script type="qwik/state">${JSON.stringify(stateItems)}</script>
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);

      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }

      await ready;
      const rawState = (container as any).$rawStateData$ as unknown[];
      expect(rawState[0]).toBe(TypeIds.Object);
      expect(container.$getObjectById$(0)).toEqual({ answer: 42 });
      expect(rawState[0]).toBe(TypeIds.Plain);
    });
  });

  it('should eagerly deserialize smaller state when state prewarm threshold is lowered', async () => {
    const stateItems: unknown[] = [TypeIds.Object, [TypeIds.Plain, 'answer', TypeIds.Plain, 42]];
    for (let i = 1; i < 128; i++) {
      stateItems.push(TypeIds.Plain, i);
    }
    const document = createDocument({
      html: `
        <html q:container="paused" q:locale="" q:base="" q:instance="" q:manifest-hash="" ${QStatePrewarmAttr}="128">
          <head :></head>
          <body :>
            <script type="qwik/state">${JSON.stringify(stateItems)}</script>
          </body>
        </html>
      `,
    }) as QDocument;

    await withYieldingVNodeData(document, async (tasks) => {
      const container = getDomContainer(document.documentElement) as DomContainer;
      const ready = whenContainerDataReady(container, () => undefined);

      while (!isContainerReady(container)) {
        runNextTask(tasks);
      }

      await ready;
      const rawState = (container as any).$rawStateData$ as unknown[];
      expect(rawState[0]).toBe(TypeIds.Plain);
      expect(container.$getObjectById$(0)).toEqual({ answer: 42 });
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
  it('should add suspense content segment elements to the root vnode table', async () => {
    const [container] = await process(`
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
  it('should materialize suspense content host from DOM when segment data starts at child', async () => {
    const [container] = await process(`
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
  it('should keep suspense result parent available as a root vnode ref', async () => {
    const [container] = await process(`
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
  it('should not cache empty children for a suspense placeholder-only result parent', async () => {
    const [container] = await process(`
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
  it('should merge suspense content segment refs into the root vnode table by segment id', async () => {
    const [container] = await process(`
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
  it('should process suspense content segment vnode data on the content host', async () => {
    const [container] = await process(`
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
  it('should process suspense content segment vnode data for nested text', async () => {
    const [container] = await process(`
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
  it('should process only requested suspense content segment vnode data', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
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
    await whenVNodeDataReady(document, () => undefined);

    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 1))).toBe(false);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('2', 0))).toBe(false);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('2', 1))).toBe(true);
    expect(container.element.qVNodeRefs?.has(getSegmentVNodeRefId('2', 2))).toBe(true);
  });
  it('should process requested suspense segment only within the provided container scope', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
    const first = getDomContainer(document.querySelector('#first')!);
    const second = getDomContainer(document.querySelector('#second')!);
    first.element.insertAdjacentHTML('beforeend', encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1'));
    second.element.insertAdjacentHTML('beforeend', encodeVNode({ 0: '{1}', 1: '~', 2: '~' }, '1'));

    processOutOfOrderSegmentVNodeData(document, '1', first.element.querySelector('[q\\:rp="1"]'));
    await whenVNodeDataReady(document, () => undefined);

    expect(first.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect(first.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 1))).toBe(true);
    expect(first.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 2))).toBe(true);
    expect(second.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 0))).toBe(false);
    expect(second.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 1))).toBe(false);
    expect(second.element.qVNodeRefs?.has(getSegmentVNodeRefId('1', 2))).toBe(false);
  });
  it('should scope out-of-order vnode processing to the current script container', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
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
    await whenVNodeDataReady(document, () => undefined);

    expect(first.element.querySelector('#first-done')).toBeFalsy();
    expect(second.element.querySelector('#second-done')).not.toBeNull();
    expect(processedContainers).toEqual(['second']);
    expect(second.element.qVNodeRefs?.get(getSegmentVNodeRefId('1', 1))).toBe(
      second.element.querySelector('#second-done')
    );
  });
  it('should process segment vnode patches during out-of-order segment processing', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
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
    await whenVNodeDataReady(document, () => undefined);

    const button = container.element.querySelector('button');
    expect(container.element.qVNodeRefs?.get(getSegmentVNodeRefId('1', 1))).toBe(
      container.element.querySelector('section')
    );
    expect(container.element.qVNodeRefs?.get(getSegmentVNodeRefId('1', 2))).toBe(button);
  });
  it('should process root vnode data patches for previously skipped entries', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
    const container = getDomContainer(document.querySelector('[q\\:container]')!);
    await appendVNodePatch(container.element, encodeVNode({ 4: '~' }, undefined, 0, true));

    expect(container.element.qVNodeRefs?.has(4)).toBe(true);
  });
  it('should process segment vnode data patches for previously emitted segment entries', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
    const container = getDomContainer(document.querySelector('[q\\:container]')!);
    await appendVNodePatch(container.element, encodeVNode({ 1: '~' }, '1', 0, true));

    const refId = getSegmentVNodeRefId('1', 1);
    const refElement = container.element.qVNodeRefs?.get(refId);
    (document as QDocument).qProcessVNodeDataPatch!(container.element.lastElementChild);
    await whenVNodeDataReady(document, () => undefined);

    expect(refElement).toBeTruthy();
    expect(container.element.qVNodeRefs?.get(refId)).toBe(refElement);
  });
  it('should scope vnode data patches to their script container', async () => {
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
    await whenVNodeDataReady(document, () => undefined);
    const first = getDomContainer(document.querySelector('#first')!);
    const second = getDomContainer(document.querySelector('#second')!);
    await appendVNodePatch(first.element, encodeVNode({ 1: '~' }, '1', 0, true));
    await appendVNodePatch(second.element, encodeVNode({ 1: '~' }, '1', 0, true));

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

  const containers: Element[] = [];
  findContainers(document, containers);

  const domContainers = containers.map(getDomContainer);

  await Promise.all(
    domContainers.map(async (container) => {
      const domContainers = container as DomContainer;
      processVNodeData(domContainers.document);
      await whenVNodeDataReady(domContainers.document, () => undefined);
      await whenContainerDataReady(container, () => undefined);
    })
  );

  return domContainers;
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

async function appendVNodePatch(target: Element, html: string) {
  target.insertAdjacentHTML('beforeend', html);
  const script = target.lastElementChild as Element;
  (target.ownerDocument as QDocument).qProcessVNodeDataPatch?.(script);
  await whenVNodeDataReady(target.ownerDocument, () => undefined);
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
