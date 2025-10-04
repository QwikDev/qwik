import type { ISsrNode, SsrAttrs } from './qwik-types';
import { SsrNode } from './ssr-node';
import type { CleanupQueue } from './ssr-container';
import { VNodeDataFlag } from './types';
import { _EMPTY_ARRAY } from '@qwik.dev/core/internal';

/**
 * Array of numbers which describes virtual nodes in the tree.
 *
 * HTML can't account for:
 *
 * - Multiple text nodes in a row. (it treats it as a single text node)
 * - Empty text nodes. (it ignores them)
 * - And virtual nodes such as `<Fragment/>` or `<MyComponent/>`
 *
 * So we need to encode all of that information into the VNodeData.
 *
 * Encoding:
 *
 * - First position is special and encodes state information and stores VNodeDataFlag.
 * - Positive numbers are text node lengths. (0 is a special case for empty text node)
 * - Negative numbers are element counts.
 * - `OPEN_FRAGMENT` is start of virtual node.
 *
 *   - If `OPEN_FRAGMENT` than the previous node is an `Array` which contains the props (see
 *       `SsrAttrs`). NOTE: The array is never going to be the last item in the VNodeData, so we can
 *       always assume that the last item in `vNodeData` is a number.
 * - `CLOSE_FRAGMENT` is end of virtual node.
 *
 * NOTE: This is how we store the information during the SSR streaming, once the SSR is complete
 * this data needs to be serialized into a string and stored in the DOM as a script tag which has
 * deferent serialization format.
 */
export type VNodeData = [VNodeDataFlag, ...(SsrAttrs | number)[]];

export const OPEN_FRAGMENT = Number.MAX_SAFE_INTEGER;
export const CLOSE_FRAGMENT = Number.MAX_SAFE_INTEGER - 1;
export const WRITE_ELEMENT_ATTRS = Number.MAX_SAFE_INTEGER - 2;

export function vNodeData_incrementElementCount(vNodeData: VNodeData) {
  const length = vNodeData.length;
  // NOTE: last item in the `vNodeData` is always a number.
  const lastValue = length > 1 ? (vNodeData[length - 1] as number) : 0;
  if (lastValue >= 0) {
    // positive numbers are text node lengths.
    // So we just add -1 to indicate that we now have one element after text node
    vNodeData.push(-1);
  } else {
    // Negative numbers are element counts.
    // So we just subtract 1 from the last element count to say that we have one more element.
    vNodeData[length - 1] = lastValue - 1;
  }
}

export function vNodeData_addTextSize(vNodeData: VNodeData, size: number) {
  const length = vNodeData.length;
  // NOTE: last item in the `vNodeData` is always a number.
  const lastValue = length > 1 ? (vNodeData[length - 1] as number) : 0;
  if (length > 1 && lastValue >= 0) {
    // previous item was text node, so we must update the flag
    vNodeData[0] |= VNodeDataFlag.TEXT_DATA;
  }
  vNodeData.push(size);
  if (size == 0) {
    // 0 is a special case for empty text node which is lost is serialization, must add flag.
    vNodeData[0] |= VNodeDataFlag.TEXT_DATA;
  }
}

export function vNodeData_openFragment(vNodeData: VNodeData, attrs: SsrAttrs) {
  vNodeData.push(attrs, OPEN_FRAGMENT);
  vNodeData[0] |= VNodeDataFlag.VIRTUAL_NODE;
}
export function vNodeData_closeFragment(vNodeData: VNodeData) {
  vNodeData.push(CLOSE_FRAGMENT);
}

export function vNodeData_openElement(vNodeData: VNodeData) {
  vNodeData.push([], WRITE_ELEMENT_ATTRS);
  vNodeData[0] |= VNodeDataFlag.ELEMENT_NODE;
}

export function vNodeData_createSsrNodeReference(
  currentComponentNode: ISsrNode | null,
  vNodeData: VNodeData,
  depthFirstElementIdx: number,
  cleanupQueue: CleanupQueue,
  currentFile: string | null
): ISsrNode {
  vNodeData[0] |= VNodeDataFlag.REFERENCE;
  const stack: number[] = [-1];
  // We are referring to a virtual node. We need to descend into the tree to find the path to the node.
  let attributesIndex = -1;
  for (let i = 1; i < vNodeData.length; i++) {
    const value = vNodeData[i];
    if (Array.isArray(value)) {
      attributesIndex = i;
      i++; // skip the `OPEN_FRAGMENT` or `WRITE_ELEMENT_ATTRS` value
      if (vNodeData[i] !== WRITE_ELEMENT_ATTRS) {
        // ignore pushing to the stack for WRITE_ELEMENT_ATTRS, because we don't want to create more depth. It is the same element
        stack[stack.length - 1]++;
        stack.push(-1);
      }
    } else if (value === CLOSE_FRAGMENT) {
      stack.pop(); // pop count
    } else if (value < 0) {
      // Negative numbers are element counts.
      const numberOfElements = 0 - value;
      // Add number of elements to skip
      stack[stack.length - 1] += numberOfElements;
    } else {
      // Positive numbers are text node lengths.
      // For each positive number we need to increment the count.
      stack[stack.length - 1]++;
    }
  }
  let refId = String(depthFirstElementIdx);
  if (vNodeData[0] & (VNodeDataFlag.VIRTUAL_NODE | VNodeDataFlag.TEXT_DATA)) {
    // encode as alphanumeric only for virtual and text nodes
    for (let i = 0; i < stack.length; i++) {
      const childCount = stack[i] as number;
      if (childCount >= 0) {
        refId += encodeAsAlphanumeric(childCount);
      }
    }
  }
  return new SsrNode(
    currentComponentNode,
    refId,
    attributesIndex,
    cleanupQueue,
    vNodeData,
    currentFile
  );
}

/**
 * Encode number as alphanumeric string.
 *
 * The last character is uppercase, this allows us to skip any sort of separator.
 *
 * Example:
 *
 * - 0 -> A
 * - 1 -> B
 * - 10 -> K
 * - 25 -> Z
 * - 26 -> bA
 * - 100 -> dW
 * - 1000 -> bmM
 * - 10000 -> ouQ
 */
const ALPHANUMERIC: string[] = [];
export function encodeAsAlphanumeric(value: number): string {
  while (ALPHANUMERIC.length <= value) {
    let value = ALPHANUMERIC.length;
    let text = '';
    do {
      text =
        String.fromCharCode(
          (text.length === 0 ? 65 /* A */ : 97) /* a */ + (value % 26) /* A-Z */
        ) + text;
      value = Math.floor(value / 26 /* A-Z */);
    } while (value !== 0);
    ALPHANUMERIC.push(text);
  }
  return ALPHANUMERIC[value];
}
