import { assert } from 'vitest';
import { QSlot } from '../core/util/markers';
import { isHtmlElement } from '../core/util/types';
import { format } from 'prettier';

/**
 * Returns true if the `node` is `Element` and of the right `tagName`.
 *
 * @private
 * @param node
 */
export function isDomElementWithTagName(
  node: Node | null | undefined,
  tagName: string
): node is Element {
  return isHtmlElement(node) && node.tagName.toUpperCase() == tagName.toUpperCase();
}

/** @private */
export function isTemplateElement(node: Node | null | undefined): node is HTMLTemplateElement {
  return isDomElementWithTagName(node, 'template');
}

/** @private */
export function isQSLotTemplateElement(node: Node | null | undefined): node is HTMLTemplateElement {
  return isTemplateElement(node) && node.hasAttribute(QSlot);
}

export async function expectDOM(actual: Element, expected: string) {
  const options = { parser: 'html', htmlWhitespaceSensitivity: 'ignore' as const };
  assert.equal(await format(actual.outerHTML, options), await format(expected, options));
}
