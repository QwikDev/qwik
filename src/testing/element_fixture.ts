/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { applyDocumentConfig } from './util';
import { createGlobal } from './document';
import type { MockDocument, MockGlobal } from './types';
import { getTestPlatform } from './platform';
import { qImport } from '@builder.io/qwik';

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
export function trigger(element: Element, selector: string, event: string): Promise<Element[]> {
  const elements: Promise<Element>[] = [];
  Array.from(element.querySelectorAll(selector)).forEach((element) => {
    const qrl = element.getAttribute('on:' + event);
    if (qrl) {
      elements.push(
        (async () => {
          const eventHandler = (await qImport(element, qrl)) as (
            element: HTMLElement,
            event: Event,
            url: URL
          ) => void;
          const url = new URL(qrl, element.ownerDocument.baseURI);
          await eventHandler(element as HTMLElement, new MockEvent(event), url);
          await getTestPlatform(element.ownerDocument).flush();
          return element as Element;
        })()
      );
    }
  });
  return Promise.all(elements);
}

const MockEvent: typeof CustomEvent = class MockEvent {
  type: string;

  constructor(type: string) {
    this.type = type;
  }
} as any;
