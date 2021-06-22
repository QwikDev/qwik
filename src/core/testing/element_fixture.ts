/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Injector } from '../index.js';
import { ElementInjector } from '../injector/element_injector.js';
import { createGlobal, QwikGlobal } from './node_utils.js';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `EntityFixture` creates:
 *
 * ```
 * <host decl:template="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * It also sets up `injector` which points to `child`.
 *
 */
export class ElementFixture {
  global: QwikGlobal;
  document: Document;
  superParent: HTMLElement;
  parent: HTMLElement;
  host: HTMLElement;
  child: HTMLElement;
  hostInjector: Injector;

  constructor(options: ElementFixtureOptions = {}) {
    this.global = createGlobal();
    this.document = this.global.document;
    this.superParent = this.document.createElement('super-parent');
    this.parent = this.document.createElement('parent');
    this.host = this.document.createElement(options.tagName || 'host');
    this.child = this.document.createElement('child');
    this.hostInjector = new ElementInjector(this.child);
    this.superParent.appendChild(this.parent);
    this.parent.appendChild(this.host);
    this.host.appendChild(this.child);
    this.document.body.appendChild(this.superParent);

    applyDocumentConfig(this.document, options);
  }
}

export function applyDocumentConfig(
  doc: Document,
  config: { baseURI?: string; protocol?: Record<string, string> }
) {
  if (config.baseURI) {
    appendConfig(doc, `baseURI`, config.baseURI);
  }
  if (config.protocol) {
    for (const protocol in config.protocol) {
      appendConfig(doc, `protocol.${protocol}`, config.protocol[protocol]);
    }
  }
}

function appendConfig(doc: Document, key: string, value: string) {
  const linkElm = doc.createElement('link');
  linkElm.setAttribute(`rel`, `q.${key}`);
  linkElm.setAttribute(`href`, value);
  doc.head.appendChild(linkElm);
}

export interface ElementFixtureOptions {
  tagName?: string;
  baseURI?: string;
  protocol?: Record<string, string>;
}
