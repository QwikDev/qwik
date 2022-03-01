import { expectDOM } from '../../testing/expect-dom.unit';
import { toDOM } from '../../testing/jsx';
import {
  cursorForParent,
  cursorReconcileElement,
  cursorReconcileEnd,
  cursorReconcileStartVirtualNode,
  cursorReconcileText,
  cursorReconcileVirtualNode,
} from './cursor';

describe('cursor', () => {
  it('should build up DOM', () => {
    const parent = toDOM(<parent></parent>);
    const parentCursor = cursorForParent(parent);
    expect(parentCursor.parent).toEqual(parent);
    expect(parentCursor.node).toEqual(null);

    const divCursor = cursorReconcileElement(parentCursor, null, 'div', {}, null, false);
    expect(parentCursor.node).toEqual(null);
    cursorReconcileText(divCursor, 'A');
    cursorReconcileEnd(divCursor);

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null, false);
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

    const divCursor = cursorReconcileElement(parentCursor, null, 'div', { id: 123 }, null, false);
    cursorReconcileText(divCursor, 'A');
    cursorReconcileEnd(divCursor);

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null, false);
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

    const divCursor = cursorReconcileElement(parentCursor, null, 'div', {}, null, false);
    cursorReconcileText(divCursor, 'A');
    cursorReconcileEnd(divCursor);

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null, false);
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
    cursorReconcileElement(childCursor, null, 'div', {}, null, false);
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

    const spanCursor = cursorReconcileElement(parentCursor, null, 'span', {}, null, false);
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
});
