import type { QComponentCtx } from '../component/component-ctx';
import { KeyValueArray, keyValueArrayGet } from '../util/array_map';
import { QSlotAttr, QSlotSelector } from '../util/markers';
import { isDomElementWithTagName, isHtmlElement } from '../util/types';

/**
 * `Slots` stores all component content elements.
 *
 * Slots are stored in `KeyValueArray`, where:
 * - `key` is `q:slot` name.
 * - `value` is `Array` of `Node`s with
 *   - the first element (at index 0) being current index used by cursor.
 *   - the second element (at index 1) being the parent element of other elements.
 *
 * Given:
 * ```
 * <component>
 *   some text
 *   <div slot="title">title text</div>
 *   <div slot="description">description text</div>
 *   <span>more text</span>
 * </component>
 * ```
 * The resulting `Slots` will be:
 *
 * ```
 * [
 *   '', [-1, <component/>,  #text(some text), <span>more text</span>],
 *   'description', [-1, <component/>, <div slot="description">description text</div>],
 *   'title', [-1, <component/>, <div slot="title">title text</div>],
 * ]
 * ```
 *
 * Notice:
 * - slots are coalesced: even though `some text` and `<span>more text</span>` are not next to
 *   each other they are placed in same bucket.
 * - slots are sorted: `['', 'description', 'title']` even though that is not the order in the DOM.
 */
export type SlotMap = KeyValueArray<NamedSlot>;

export type NamedSlot = [
  /// cursor index, or -1 if not being used as index
  number,
  // Parent element
  Element | DocumentFragment,
  // Actual nodes
  ...Node[]
];

export const enum NamedSlotEnum {
  index = 0,
  parent = 1,
  firstNode = 2,
}

export function isSlotMap(value: any): value is SlotMap {
  return Array.isArray(value);
}

/**
 * Retrieves the current `SlotMap` from `QComponent`
 *
 *
 * This method collects the content `Node`s for a given component.
 *
 * @param component
 * @returns
 */
export function getSlotMap(component: QComponentCtx): SlotMap {
  const slots = [] as any as SlotMap;
  const host = component.hostElement;
  const firstChild = host.firstElementChild;
  if (isQSlotTemplate(firstChild)) {
    slotMapAddChildren(slots, firstChild.content, null);
  }
  const previousSlots: Element[] = [];
  host.querySelectorAll(QSlotSelector).forEach((qSlot) => {
    for (const parent of previousSlots) {
      if (parent.contains(qSlot)) {
        // When we do `querySelectorAll` it is possible that we get `<q:slot>`
        // which are children of existing `<q:slot>`. This check is here
        // to make sure that we don't get `<q:lsot>` recursively.
        // <component>
        //   <q:slot include-me>
        //     <q:slot dont-include-me></q:slot>
        //   </q:slot>
        // </component>
        return;
      }
    }
    previousSlots.push(qSlot);
    const name = qSlot.getAttribute('name') || '';
    slotMapAddChildren(slots!, qSlot, name);
  });

  return slots;
}

/**
 * Determines if the `node` is `<template q:slot>` used for storing un-projected items.
 */
function isQSlotTemplate(node: Element | null): node is HTMLTemplateElement {
  return isDomElementWithTagName(node, 'template') && node.hasAttribute(QSlotAttr);
}

/**
 * Add projected nodes into `SlotMap`.
 *
 * See `SlotMap` for the layout.
 *
 * @param slots
 * @param parent Parent whoes children should be added to the `slots`.
 */
function slotMapAddChildren(slots: SlotMap, parent: Node, name: string | null) {
  _slotParent = parent;
  let child = parent.firstChild;
  if (name !== null) {
    keyValueArrayGet(slots, name, emptyArrayFactory);
  }
  while (child) {
    const slotName =
      name !== null ? name : (isHtmlElement(child) && child.getAttribute(QSlotAttr)) || '';
    keyValueArrayGet(slots, slotName, emptyArrayFactory).push(child);
    child = child.nextSibling;
  }
  _slotParent = undefined;
}

let _slotParent: Node | undefined;

function emptyArrayFactory() {
  return [-1, _slotParent];
}
