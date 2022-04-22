import { qError, QError } from '../error/error';
import { getParentElement } from './dom';

/**
 * Read attributes from `Element` and return them as an object literal.
 *
 * NOTE: This function ignores all special attributes such as `::`.
 *
 * @param element - Element to read attributes from.
 */
export function readElementAttributes(element: Element): { [attribute: string]: string } {
  const props: { [attribute: string]: string } = {};
  const attrs = element.attributes;
  // todo: extract to utility function
  for (let i = 0, ii = attrs.length; i < ii; i++) {
    const attr = attrs[i];
    const name = attr.name;
    if (name.indexOf(':') == -1 && name.indexOf('.') == -1) {
      // ignore all special attributes.
      (props as { [key: string]: string })[name] = attr.value;
    }
  }
  return props;
}

/**
 * Find a parent `Element` which has either `attributePrimary` or `attributeSecondary`.
 *
 * @param element `Element` where the search should be initiated at
 * @param qNotFoundError Error if attribute not found
 * @param attributePrimary Primary attribute to look for.
 * @param callbackPrimary Callback to call if primary attribute is found
 * @param attributeSecondary Secondary attribute to look for.
 * @param callbackSecondary Callback to call if secondary attribute is found
 * @internal
 */
export function findAttribute<RET1, RET2>(
  element: Element,
  qNotFoundError: QError,
  attributePrimary: string,
  callbackPrimary: (element: Element, attrName: string, attrValue: string) => RET1,
  attributeSecondary?: string,
  callbackSecondary?: (element: Element, attrName: string, attrValue: string) => RET2
): RET1 | RET2 {
  let cursor: Element | null = element;
  while (cursor) {
    const attrValuePrimary = cursor.getAttribute(attributePrimary);
    if (attrValuePrimary !== null) {
      return callbackPrimary(cursor, attributePrimary, attrValuePrimary);
    }
    if (attributeSecondary && callbackSecondary) {
      const attrValueSecondary = cursor.getAttribute(attributeSecondary);
      if (attrValueSecondary !== null) {
        return callbackSecondary(cursor, attributeSecondary, attrValueSecondary);
      }
    }
    cursor = getParentElement(cursor);
  }
  throw attributeSecondary
    ? qError(qNotFoundError, attributePrimary, attributeSecondary, element)
    : qError(qNotFoundError, attributePrimary, element);
}
