import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_newUnMaterializedElement,
} from '../client/vnode';
import type { ContainerElement, ElementVNode, QDocument } from '../client/types';
import { vnode_documentPosition } from './scheduler-document-position';
import { createDocument } from '@qwik.dev/dom';

describe('vnode_documentPosition', () => {
  let parent: ContainerElement;
  let document: QDocument;
  let vParent: ElementVNode;
  beforeEach(() => {
    document = createDocument() as QDocument;
    document.qVNodeData = new WeakMap();
    parent = document.createElement('test') as ContainerElement;
    parent.qVNodeRefs = new Map();
    vParent = vnode_newUnMaterializedElement(parent);
  });
  afterEach(() => {
    parent = null!;
    document = null!;
    vParent = null!;
  });

  it('should compare two elements', () => {
    parent.innerHTML = '<b></b><i></i>';
    const b = vnode_getFirstChild(vParent) as ElementVNode;
    const i = vnode_getNextSibling(b) as ElementVNode;
    expect(vnode_documentPosition(b, i, null)).toBe(-1);
    expect(vnode_documentPosition(i, b, null)).toBe(1);
  });
  it('should compare two virtual vNodes', () => {
    parent.innerHTML = 'AB';
    document.qVNodeData.set(parent, '{B}{B}');
    const a = vnode_getFirstChild(vParent) as ElementVNode;
    const b = vnode_getNextSibling(a) as ElementVNode;
    expect(vnode_documentPosition(a, b, null)).toBe(-1);
    expect(vnode_documentPosition(b, a, null)).toBe(1);
  });
  it('should compare two virtual vNodes', () => {
    parent.innerHTML = 'AB';
    document.qVNodeData.set(parent, '{{B}}{B}');
    const a = vnode_getFirstChild(vParent) as ElementVNode;
    const a2 = vnode_getFirstChild(a) as ElementVNode;
    const b = vnode_getNextSibling(a) as ElementVNode;
    expect(vnode_documentPosition(a2, b, null)).toBe(-1);
    expect(vnode_documentPosition(b, a2, null)).toBe(1);
  });
});
