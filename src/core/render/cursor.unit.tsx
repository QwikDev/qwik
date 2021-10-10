import { Fragment, h, Slot } from '@builder.io/qwik';
import { expectDOM } from '../../testing/expect-dom';
import { toDOM } from '../../testing/jsx';
import { qHook } from '../component/qrl-hook.public';
import { AttributeMarker } from '../util/markers';
import {
  cursorForParent,
  cursorReconcileElement,
  cursorReconcileEnd,
  cursorReconcileStartVirtualNode,
  cursorReconcileText,
  cursorReconcileVirtualNode,
} from './cursor';
import type { ComponentRenderQueue } from './q-render';
import { getQComponent } from '../component/q-component-ctx';

describe('cursor', () => {
  it('should build up DOM', () => {
    const parent = toDOM(<parent></parent>);
    const parentCursor = cursorForParent(parent);
    expect(parentCursor.parent).toEqual(parent);
    expect(parentCursor.node).toEqual(null);

    const divCursor = cursorReconcileElement(parentCursor, null, 'div', {}, null);
    expect(parentCursor.node).toEqual(null);
    cursorReconcileText(divCursor, 'A');
    cursorReconcileEnd(divCursor);

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null);
    expect(parentCursor.node).toEqual(null);
    cursorReconcileText(spanCursor, 'B');
    cursorReconcileEnd(spanCursor);

    cursorReconcileEnd(parentCursor);

    expectDOM(
      parent,
      <parent>
        <div>A</div>
        <span>B</span>
      </parent>
    );
  });

  it('should perform basic reconciliation', () => {
    const parent = toDOM(
      <parent>
        <div>A</div>
        <span>B</span>
      </parent>
    );
    const parentCursor = cursorForParent(parent);
    expect(parentCursor.parent).toEqual(parent);
    expect(parentCursor.node).toEqual(parent.querySelector('div'));

    const divCursor = cursorReconcileElement(parentCursor, null, 'div', { id: 123 }, null);
    cursorReconcileText(divCursor, 'A');
    cursorReconcileEnd(divCursor);

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null);
    cursorReconcileText(spanCursor, 'B');
    cursorReconcileEnd(spanCursor);

    cursorReconcileEnd(parentCursor);

    expectDOM(
      parent,
      <parent>
        <div id="123">A</div>
        <span>B</span>
      </parent>
    );
  });

  it('should fix DOM to match', () => {
    const parent = toDOM(
      <parent>
        <span>
          Hello <b>World</b>!
        </span>
        <div>A</div>
      </parent>
    );
    const parentCursor = cursorForParent(parent);

    const divCursor = cursorReconcileElement(parentCursor, null, 'div', {}, null);
    cursorReconcileText(divCursor, 'A');
    cursorReconcileEnd(divCursor);

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null);
    cursorReconcileText(spanCursor, 'B');
    cursorReconcileEnd(spanCursor);

    cursorReconcileEnd(parentCursor);

    expectDOM(
      parent,
      <parent>
        <div>A</div>
        <span>B</span>
      </parent>
    );
  });

  it('should reconcile vNode', () => {
    const parent = toDOM(<parent></parent>);
    const parentCursor = cursorForParent(parent);
    cursorReconcileText(parentCursor, 'HEAD');
    const childCursor = cursorReconcileVirtualNode(parentCursor);
    cursorReconcileText(parentCursor, 'TAIL');
    cursorReconcileEnd(parentCursor);
    expectDOM(
      parent,
      <parent>
        HEAD
        {/<node:.*>/}
        {/<\/node:.*>/}
        TAIL
      </parent>
    );
    cursorReconcileStartVirtualNode(childCursor);
    cursorReconcileText(childCursor, 'ABC');
    cursorReconcileElement(childCursor, null, 'div', {}, null);
    cursorReconcileEnd(childCursor);
    expectDOM(
      parent,
      <parent>
        HEAD
        {/<node:.*>/}
        ABC
        <div />
        {/<\/node:.*>/}
        TAIL
      </parent>
    );
  });

  it('should clear reminding', () => {
    const parent = toDOM(
      <parent>
        <span>
          Hello <b>World</b>!
        </span>
      </parent>
    );
    const parentCursor = cursorForParent(parent);
    const span = parent.querySelector('span');

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null);
    cursorReconcileText(spanCursor, 'A');
    cursorReconcileEnd(spanCursor);

    cursorReconcileEnd(parentCursor);

    // It must be not-destroyed
    expect(span).toBe(parent.querySelector('span'));

    expectDOM(
      parent,
      <parent>
        <span>A</span>
      </parent>
    );
  });

  describe('projection', () => {
    let log: ComponentRenderQueue;
    beforeEach(() => (log = []));

    it('should build up DOM', () => {
      const parent = toDOM(<parent></parent>);
      const parentCursor = cursorForParent(parent);

      const componentCursor = cursorReconcileElement(
        parentCursor,
        null,
        'component',
        COMPONENT_ATTRS,
        log
      );
      cursorReconcileText(componentCursor, 'ABC');

      cursorReconcileEnd(parentCursor);

      expectDOM(
        parent,
        <parent>
          <component>
            <template q:slot="">ABC</template>
          </component>
        </parent>
      );
    });

    it('should reconcile non-projected nodes', () => {
      const parent = toDOM(
        <parent>
          <component on:q-render={qHook(() => null) as any}>
            <template q:slot={true as any}>
              OLD
              <b />
            </template>
          </component>
        </parent>
      );
      const parentCursor = cursorForParent(parent);

      const componentCursor = cursorReconcileElement(
        parentCursor,
        null,
        'component',
        COMPONENT_ATTRS,
        log
      );
      cursorReconcileText(componentCursor, 'NEW');
      cursorReconcileEnd(componentCursor);

      cursorReconcileEnd(parentCursor);

      expectDOM(
        parent,
        <parent>
          <component>
            <template q:slot={true as any}>NEW</template>
          </component>
        </parent>
      );
    });

    it('should reconcile projected element', () => {
      const parent = toDOM(
        <parent>
          <component on:q-render={qHook(() => null) as any}>
            <q:slot name="detail">
              <b />
            </q:slot>
          </component>
        </parent>
      );
      const parentCursor = cursorForParent(parent);

      const componentCursor = cursorReconcileElement(
        parentCursor,
        null,
        'component',
        COMPONENT_ATTRS,
        log
      );
      const divCursor = cursorReconcileElement(
        componentCursor,
        null,
        'div',
        { [AttributeMarker.QSlotAttr]: 'detail' },
        null
      );
      cursorReconcileText(divCursor, 'DETAIL');

      cursorReconcileEnd(divCursor);
      cursorReconcileEnd(componentCursor);
      cursorReconcileEnd(parentCursor);

      expectDOM(
        parent,
        <parent>
          <component>
            <q:slot name="detail">
              <div q:slot="detail">DETAIL</div>
            </q:slot>
          </component>
        </parent>
      );
    });

    it('should not mark already rendered component for rendering if it gets moved to the inert slot', async () => {
      const parent = toDOM(
        <parent>
          <component
            on:q-render={qHook(() => (
              <Slot />
            ))}
          >
            <template q:slot={true as any}>
              <child on:q-render={childOnRender}>DON'T OVERRIDE ME</child>
            </template>
          </component>
        </parent>
      );
      const component = parent.querySelector('component')!;
      const compCtx = getQComponent(component)!;
      await compCtx.render();
      expectDOM(
        parent,
        <parent>
          <component>
            <template q:slot="true"></template>
            <q:slot name="">
              <child>DON'T OVERRIDE ME</child>
            </q:slot>
          </component>
        </parent>
      );
    });
    it('should render a component when it is marked and gets moved out of inert slot', async () => {
      const parent = toDOM(
        <parent>
          <component
            on:q-render={qHook(() => (
              <Slot />
            ))}
          >
            <template q:slot={true as any}>
              <child on:q-render={childOnRender} on:q-render-notify />
            </template>
          </component>
        </parent>
      );
      const component = parent.querySelector('component')!;
      const compCtx = getQComponent(component)!;
      await compCtx.render();
      expectDOM(
        parent,
        <parent>
          <component>
            <template q:slot="true"></template>
            <q:slot name="">
              <child>
                <div>WORKS</div>
              </child>
            </q:slot>
          </component>
        </parent>
      );
    });

    it('should render component if it gets placed in non-inert slot', async () => {
      const parent = toDOM(
        <parent>
          <component on:q-render={qHook(() => null) as any}>
            <template q:slot={true as any}></template>
            <q:slot name=""></q:slot>
          </component>
        </parent>
      );
      const parentCursor = cursorForParent(parent);
      const componentCursor = cursorReconcileElement(
        parentCursor,
        null,
        'component',
        COMPONENT_ATTRS,
        log
      );
      const childCursor = cursorReconcileElement(
        componentCursor,
        null,
        'child',
        { [AttributeMarker.OnRender]: childOnRender },
        log
      );
      cursorReconcileEnd(childCursor);
      cursorReconcileEnd(componentCursor);
      cursorReconcileEnd(parentCursor);
      await Promise.all(log); // Wait for the component to render
      expectDOM(
        parent,
        <parent>
          <component>
            <template q:slot="true"></template>
            <q:slot name="">
              <child>
                <div>WORKS</div>
              </child>
            </q:slot>
          </component>
        </parent>
      );
    });
  });
});

const childOnRender = qHook(() => <div>WORKS</div>);
const COMPONENT_ATTRS = { [AttributeMarker.OnRender]: childOnRender };
