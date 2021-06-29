/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Injector } from '@builder.io/qwik';
import { ElementInjector } from '@builder.io/qwik';
import { applyDocumentConfig } from './config';
import { createGlobal } from './global';
import type { MockDocument, MockGlobal, MockHTMLElement } from './types';

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
  global: MockGlobal;
  document: MockDocument;
  superParent: MockHTMLElement;
  parent: MockHTMLElement;
  host: MockHTMLElement;
  child: MockHTMLElement;
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

export interface ElementFixtureOptions {
  tagName?: string;
  baseURI?: string;
  protocol?: Record<string, string>;
}
