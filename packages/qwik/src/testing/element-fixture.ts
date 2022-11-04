import { fromCamelToKebabCase } from '../core/util/case';
import { createWindow } from './document';
import { getTestPlatform } from './platform';
import type { MockDocument, MockWindow } from './types';
import { getWrappingContainer } from '../core/use/use-core';
import { assertDefined } from '../core/error/assert';
import { tryGetContext, QContext } from '../core/state/context';
import { normalizeOnProp } from '../core/state/listeners';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `EntityFixture` creates:
 *
 * ```
 * <host q:view="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * @alpha
 *
 */
export class ElementFixture {
  window: MockWindow;
  document: MockDocument;
  superParent: HTMLElement;
  parent: HTMLElement;
  host: HTMLElement;
  child: HTMLElement;

  constructor(options: ElementFixtureOptions = {}) {
    this.window = createWindow();
    this.document = this.window.document;
    this.superParent = this.document.createElement('super-parent');
    this.parent = this.document.createElement('parent');
    this.host = this.document.createElement(options.tagName || 'host');
    this.child = this.document.createElement('child');
    this.superParent.appendChild(this.parent);
    this.parent.appendChild(this.host);
    this.host.appendChild(this.child);
    this.document.body.appendChild(this.superParent);
  }
}

/**
 * @alpha
 */
export interface ElementFixtureOptions {
  tagName?: string;
}

/**
 * Trigger an event in unit tests on an element.
 * Posibly deprecated in the future
 * @param element
 * @param selector
 * @param event
 * @returns
 * @alpha
 */
export async function trigger(
  root: Element,
  selector: string,
  eventNameCamel: string
): Promise<void> {
  for (const element of Array.from(root.querySelectorAll(selector))) {
    const kebabEventName = fromCamelToKebabCase(eventNameCamel);
    const event = { type: kebabEventName };
    const attrName = 'on:' + kebabEventName;
    await dispatch(element, attrName, event);
  }
  await getTestPlatform().flush();
}

/**
 * Dispatch
 * @param root
 * @param attrName
 * @param ev
 */
export const dispatch = async (root: Element | null, attrName: string, ev: any) => {
  while (root) {
    const elm = root;
    const ctx = tryGetContext(elm);
    const qrls = ctx?.li.filter((li) => li[0] === attrName);
    if (qrls && qrls.length > 0) {
      for (const q of qrls) {
        await q[1].getFn([elm, ev], () => elm.isConnected)(ev, elm);
      }
    }
    root = elm.parentElement;
  }
};
export function getEvent(elCtx: QContext, prop: string): any {
  return qPropReadQRL(elCtx, normalizeOnProp(prop));
}

export function qPropReadQRL(elCtx: QContext, prop: string): ((event: Event) => void) | null {
  const allListeners = elCtx.li;
  const containerEl = getWrappingContainer(elCtx.$element$);
  assertDefined(containerEl, 'container element must be defined');

  return (event) => {
    return Promise.all(
      allListeners
        .filter((li) => li[0] === prop)
        .map(([_, qrl]) => {
          qrl.$setContainer$(containerEl);
          return qrl(event);
        })
    );
  };
}
