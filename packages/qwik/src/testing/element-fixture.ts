import { getContext, normalizeOnProp, QContext } from '../core/props/props';
import type { QwikDocument } from '../core/document';
import { fromCamelToKebabCase } from '../core/util/case';
import { createWindow } from './document';
import { getTestPlatform } from './platform';
import type { MockDocument, MockWindow } from './types';
import { getWrappingContainer } from '../core/use/use-core';
import { assertDefined } from '../core/assert/assert';

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
 *
 * @param element
 * @param selector
 * @param event
 * @returns
 */
export async function trigger(
  element: Element,
  selector: string,
  eventNameCamel: string
): Promise<Element[]> {
  const elements: Promise<Element>[] = [];
  Array.from(element.querySelectorAll(selector)).forEach((element) => {
    const kebabEventName = fromCamelToKebabCase(eventNameCamel);
    const qrlAttr = element.getAttribute('on:' + kebabEventName);
    if (qrlAttr) {
      qrlAttr.split('/n').forEach((qrl) => {
        const event = { type: kebabEventName };
        const url = new URL(qrl, 'http://mock-test/');

        // Create a mock document to simulate `qwikloader` environment.
        const previousQDocument: QwikDocument = (globalThis as any).document;
        const document: QwikDocument = ((globalThis as any).document =
          element.ownerDocument as any);
        document.__q_context__ = [element, event, url];
        try {
          const elCtx = getContext(element);
          const handler = getEvent(elCtx, 'on-' + eventNameCamel);
          if (handler) {
            elements.push(handler());
          } else {
            console.error('handler not available');
          }
        } finally {
          document.__q_context__ = undefined;
          (globalThis as any).document = previousQDocument;
        }
      });
    }
  });
  await getTestPlatform().flush();
  return Promise.all(elements);
}

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
