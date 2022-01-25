/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qProps } from '@builder.io/qwik';
import type { QwikDocument } from '../core/document';
import { fromCamelToKebabCase } from '../core/util/case';
import { qGlobal } from '../core/util/qdev';
import { createGlobal } from './document';
import { getTestPlatform } from './platform';
import type { MockDocument, MockGlobal } from './types';
import { applyDocumentConfig } from './util';

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
 * It also sets up `injector` which points to `child`.
 *
 */
export class ElementFixture {
  global: MockGlobal;
  document: MockDocument;
  superParent: HTMLElement;
  parent: HTMLElement;
  host: HTMLElement;
  child: HTMLElement;

  constructor(options: ElementFixtureOptions = {}) {
    this.global = createGlobal();
    this.document = this.global.document;
    this.superParent = this.document.createElement('super-parent');
    this.parent = this.document.createElement('parent');
    this.host = this.document.createElement(options.tagName || 'host');
    this.child = this.document.createElement('child');
    this.superParent.appendChild(this.parent);
    this.parent.appendChild(this.host);
    this.host.appendChild(this.child);
    this.document.body.appendChild(this.superParent);

    applyDocumentConfig(this.document, options);
  }
}

export interface ElementFixtureOptions {
  tagName?: string;
  baseURI?: string;
  protocol?: { [protocol: string]: string };
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
        const previousQDocument: QwikDocument = (qGlobal as any).document;
        const document: QwikDocument = ((qGlobal as any).document = element.ownerDocument as any);
        document.__q_context__ = [element, event, url];
        try {
          const props = qProps(element);
          const handler = props['on:' + eventNameCamel];
          if (handler) {
            elements.push(handler());
          }
        } finally {
          document.__q_context__ = undefined;
          (qGlobal as any).document = previousQDocument;
        }
      });
    }
  });
  await getTestPlatform(element.ownerDocument).flush();
  return Promise.all(elements);
}
