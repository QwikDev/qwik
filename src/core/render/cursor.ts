import {
  assertDefined,
  assertEqual,
  assertGreater,
  assertGreaterOrEqual,
  assertNotEqual,
} from '../assert/assert';
import type { QComponentCtx } from '../component/q-component-ctx';
import { getQComponent } from '../component/q-component-ctx';
import { keyValueArrayGet } from '../util/array_map';
import { isComment, isDocument } from '../util/element';
import { AttributeMarker } from '../util/markers';
import {
  isComponentElement,
  isDomElementWithTagName,
  isQSLotTemplateElement,
  NodeType,
} from '../util/types';
import { didQPropsChange } from '../props/q-props';
import type { ComponentRenderQueue } from './q-render';
import { getSlotMap, isSlotMap, NamedSlot, NamedSlotEnum, SlotMap } from './slots';
import { qProps } from '../props/q-props.public';

/**
 * Cursor represents a set of sibling elements at a given level in the DOM.
 *
 * The cursor is used for reconciling what the JSX expects vs what the DOM has.
 * NOTE: Descending to a child involves creating a new cursor.
 *
 * Cursor allows these operations:
 * - `cursorForParent`: creates cursor for a given parent.
 * - `cursorForComponent`: creates cursor if parent is component, and we are reconciling component
 *    view.
 * - `cursorReconcileElement`: Ensures that the current DOM node matches a given shape.
 * - `cursorReconcileText`: Ensures that the current DOM node matches a given text.
 * - `cursorReconcileEnd`: Ensures that there are no more dangling elements.
 */
export interface Cursor {
  parent: Node | null;
  /**
   * `Node`: points to the current node which needs to be reconciled.
   * `SlotMap`: points to the current set of projections
   * `null': points to the next element after the last sibling. (Reconciliation will insert new
   *      element.)
   * `undefined`: The cursor has been closed with `cursorReconcileEnd`. No further operations are
   *      allowed.
   */
  node: Node | SlotMap | null /** | undefined // not included as it is end state */;
  end: Node | null;
}

/**
 * Create a cursor which reconciles logical children.
 *
 * Here logical means children as defined by JSX. (This will be same as DOM except
 * in the case of projection.) In case of projection the cursor will correctly
 * deal with the logical children of the View (rather then rendered children.)
 *
 * See: `cursorForComponent`
 *
 * @param parent Parent `Element` whose children should be reconciled.
 */
export function cursorForParent(parent: Node): Cursor {
  let firstChild = parent.firstChild;
  if (firstChild && firstChild.nodeType === NodeType.DOCUMENT_TYPE_NODE) {
    firstChild = firstChild.nextSibling;
  }
  return newCursor(parent, firstChild, null);
}

function newCursor(parent: Node | null, node: Node | SlotMap | null, end: Node | null): Cursor {
  return { parent, node, end };
}

function getNode(cursor: Cursor) {
  const node = cursor.node;
  return cursor.end == node ? null : node;
}

function setNode(cursor: Cursor, node: Node | null) {
  cursor.node = cursor.end == node ? null : node;
}

export function cursorClone(cursor: Cursor): Cursor {
  return newCursor(cursor.parent, cursor.node, cursor.end);
}

/**
 * Reconcile view children of a component.
 *
 * Use this method to create a cursor when reconciling a component's view.
 *
 * The main point of this method is to skip the `<template q:slot/>` Node.
 *
 * @param componentHost Component host element for which view children should be
 *     reconciled.
 * @returns
 */
export function cursorForComponent(componentHost: Node): Cursor {
  assertEqual(isComponentElement(componentHost), true);
  let firstNonTemplate = componentHost.firstChild;
  if (isQSLotTemplateElement(firstNonTemplate)) {
    firstNonTemplate = firstNonTemplate.nextSibling;
  }
  return newCursor(componentHost, firstNonTemplate, null);
}

/**
 * Ensure that node at cursor is an `Element` with given attributes.
 *
 * Reconciles the current cursor location with `expectTag`/`expectProps`.
 * This method will either leave the element alone if it matches, updates the
 * props, or completely removes and replaces the node with correct element.
 *
 * After invocation of this method, the cursor is advanced to the next sibling.
 *
 * @param cursor
 * @param component `ComponentRenderContext` of the component to whom the view childer
 *        logically belong.
 * @param expectTag
 * @param expectProps
 * @param componentRenderQueue Set if the current element is a component.
 *    This means that the reconciliation should detect input changes and if
 *    present add the component to the `componentRenderQueue` for further processing.
 * @returns Child `Cursor` to reconcile the children of this `Element`.
 */
export function cursorReconcileElement(
  cursor: Cursor,
  component: QComponentCtx | null,
  expectTag: string,
  expectProps: Record<string, any> | typeof String,
  componentRenderQueue: ComponentRenderQueue | null
): Cursor {
  let node = getNode(cursor);
  assertNotEqual(node, undefined, 'Cursor already closed');
  if (isSlotMap(node)) {
    assertDefined(cursor.parent);
    return slotMapReconcileSlots(
      cursor.parent!,
      node,
      cursor.end,
      component,
      expectTag,
      expectProps,
      componentRenderQueue
    );
  } else {
    assertNotEqual(node, undefined, 'Cursor already closed');
    node = _reconcileElement(
      cursor.parent!,
      node,
      cursor.end,
      component,
      expectTag,
      expectProps,
      componentRenderQueue
    );
    assertDefined(node);
    setNode(cursor, node.nextSibling);
    return _reconcileElementChildCursor(node as Element, !!componentRenderQueue);
  }
}

function slotMapReconcileSlots(
  parent: Node,
  slots: SlotMap,
  end: Node | null,
  component: QComponentCtx | null,
  expectTag: string,
  expectProps: Record<string, any>,
  componentRenderQueue: ComponentRenderQueue | null
): Cursor {
  const slotName = expectProps[AttributeMarker.QSlotAttr] || '';
  const namedSlot = keyValueArrayGet(slots, slotName);
  let childNode: Node;
  if (namedSlot) {
    assertGreaterOrEqual(namedSlot.length, 2);
    const parent = namedSlot[NamedSlotEnum.parent];
    let index = namedSlot[NamedSlotEnum.index];
    if (index == -1) {
      index = 2;
    }
    childNode = (namedSlot.length > index ? namedSlot[index] : null) as Node;
    const node = _reconcileElement(
      parent,
      childNode,
      end,
      component,
      expectTag,
      expectProps,
      componentRenderQueue
    );
    if (childNode !== node) {
      namedSlot[index] = node;
      childNode = node;
    }
    namedSlot[NamedSlotEnum.index] = index + 1;
  } else {
    const template = getUnSlottedStorage(parent as Element);
    childNode = _reconcileElement(
      template.content,
      null,
      end,
      component,
      expectTag,
      expectProps,
      true
    );
    assertDefined(childNode);
  }
  return _reconcileElementChildCursor(childNode as Element, !!componentRenderQueue);
}

function _reconcileElement(
  parent: Node,
  existing: Node | null,
  end: Node | null,
  component: QComponentCtx | null,
  expectTag: string,
  expectProps: Record<string, any> | StringConstructor,
  componentRenderQueue: ComponentRenderQueue | null | true
): Element {
  let shouldDescendIntoComponent: boolean;
  let reconciledElement: HTMLElement;
  if (isDomElementWithTagName(existing, expectTag)) {
    const props = qProps(existing as HTMLElement) as any;
    Object.assign(props, expectProps);
    shouldDescendIntoComponent = didQPropsChange(props) && !!componentRenderQueue;
    reconciledElement = existing as HTMLElement;
  } else {
    // Expected node and actual node did not match. Need to switch.
    reconciledElement = replaceNode(
      parent,
      existing,
      (isDocument(parent) ? parent : parent.ownerDocument!).createElement(expectTag),
      end
    );
    shouldDescendIntoComponent = !!componentRenderQueue;
    Object.assign(qProps(reconciledElement), expectProps);
  }
  component && component.styleClass && reconciledElement.classList.add(component.styleClass);
  if (shouldDescendIntoComponent) {
    const hostComponent = getQComponent(reconciledElement)!;
    hostComponent.styleHostClass && reconciledElement.classList.add(hostComponent.styleHostClass);
    if (Array.isArray(componentRenderQueue)) {
      componentRenderQueue.push(hostComponent.render());
    } else if (reconciledElement.getAttribute(AttributeMarker.OnRenderAttr)) {
      reconciledElement.setAttribute(AttributeMarker.RenderNotify, '');
    }
  }
  return reconciledElement;
}

function _reconcileElementChildCursor(node: Element, isComponent: boolean) {
  assertDefined(node);
  if (isComponent) {
    // We are a component. We need to return Slots
    return newCursor(node, getSlotMap(getQComponent(node)!), null);
  } else {
    // Not a component, normal return.
    return cursorForParent(node);
  }
}

/**
 * Ensure that node at cursor is a `Text`.
 *
 * Reconciles the current cursor location with expected text.
 * This method will either leave the text alone if it matches, updates the
 * text, or completely removes and replaces the node with correct text.
 *
 * After invocation of this method, the cursor is advanced to the next sibling.
 *
 * @param cursor
 * @param expectText
 */
export function cursorReconcileText(cursor: Cursor, expectText: string): void {
  let node = getNode(cursor);
  assertNotEqual(node, undefined, 'Cursor already closed');
  assertDefined(cursor.parent);
  if (isSlotMap(node)) {
    let parent: Node;
    let childNode: Node | null;
    const namedSlot = keyValueArrayGet(node, '');
    if (namedSlot) {
      assertGreaterOrEqual(namedSlot.length, 2);
      parent = namedSlot[NamedSlotEnum.parent];
      let index = namedSlot[NamedSlotEnum.index];
      if (index == -1) {
        index = 2;
      }
      childNode = (namedSlot.length > index ? namedSlot[index] : null) as Node | null;
      node = _reconcileText(parent, childNode, cursor.end, expectText);
      if (childNode !== node) {
        namedSlot[index] = node;
      }
      namedSlot[NamedSlotEnum.index] = index + 1;
    } else {
      const template = getUnSlottedStorage(cursor.parent as Element);
      _reconcileText(template.content, null, cursor.end, expectText);
    }
  } else {
    node = _reconcileText(cursor.parent!, node, cursor.end, expectText);
    setNode(cursor, node.nextSibling);
  }
}

function _reconcileText(
  parent: Node,
  node: Node | null,
  beforeNode: Node | null,
  expectText: string
): Node {
  // Reconcile as Text Node
  if (node && node.nodeType == NodeType.TEXT_NODE) {
    if (node.textContent !== expectText) {
      node.textContent = expectText;
    }
  } else {
    // Expected node and actual node did not match. Need to switch.
    node = replaceNode(parent, node, parent.ownerDocument!.createTextNode(expectText), beforeNode);
  }
  return node;
}

/**
 * Close out the cursor and clear any extra elements.
 *
 * Invocation of this method indicates that no mare Nodes after the cursor are expected.
 * This is a signal to remove any excess `Node`s if present.
 *
 * @param cursor
 */
export function cursorReconcileEnd(cursor: Cursor): void {
  let node = getNode(cursor);
  if (isSlotMap(node)) {
    for (let i = 0; i < node.length; i = i + 2) {
      const namedSlot = node[i + 1] as NamedSlot;
      if (namedSlot[NamedSlotEnum.index] !== -1) {
        assertGreater(namedSlot[NamedSlotEnum.index], NamedSlotEnum.parent);
        for (let k = namedSlot[NamedSlotEnum.index]; k < namedSlot.length; k++) {
          namedSlot[NamedSlotEnum.parent].removeChild(namedSlot[k] as Element);
        }
      }
    }
  } else {
    while (node) {
      const next = (node as Node).nextSibling as Node | null;
      cursor.parent!.removeChild(node as Node);
      node = next;
    }
  }
  setNode(cursor, undefined!);
}

function getUnSlottedStorage(componentElement: Element): HTMLTemplateElement {
  assertEqual(isComponentElement(componentElement), true, 'Must be component element');
  let template = componentElement?.firstElementChild as HTMLTemplateElement | null;
  if (
    !isDomElementWithTagName(template, 'template') ||
    !template.hasAttribute(AttributeMarker.QSlotAttr)
  ) {
    template = componentElement.insertBefore(
      componentElement.ownerDocument.createElement('template'),
      template
    );
    template.setAttribute(AttributeMarker.QSlotAttr, '');
  }
  return template;
}

const V_NODE_START = '<node:';
const V_NODE_END = '</node:';

export function cursorReconcileVirtualNode(cursor: Cursor): Cursor {
  let node = getNode(cursor);
  if (isSlotMap(node)) {
    // TODO(misko): proper error and test;
    throw new Error('Not expecting slot map here');
  } else {
    if (isComment(node) && node.textContent?.startsWith(V_NODE_START)) {
      throw new Error('IMPLEMENT');
    } else {
      const id = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
      const parent = cursor.parent!;
      const doc = parent.ownerDocument!;
      const startVNode = doc.createComment(V_NODE_START + id + '>');
      const endVNode = doc.createComment(V_NODE_END + id + '>');
      node = replaceNode(cursor.parent!, node, endVNode, null);
      cursor.parent!.insertBefore(startVNode, endVNode);
      setNode(cursor, endVNode.nextSibling);
      return newCursor(parent, startVNode, endVNode);
    }
  }
}

export function cursorReconcileStartVirtualNode(cursor: Cursor) {
  const node = getNode(cursor);
  assertEqual(isComment(node) && node.textContent!.startsWith(V_NODE_START), true);
  setNode(cursor, node && (node as Node).nextSibling);
}

export function replaceNode<T extends Node>(
  parentNode: Node,
  existingNode: Node | null,
  newNode: T,
  insertBefore: Node | null
): T {
  parentNode.insertBefore(newNode, existingNode || insertBefore);
  if (existingNode) {
    parentNode.removeChild(existingNode);
  }
  return newNode;
}
