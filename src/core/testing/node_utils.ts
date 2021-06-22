/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { default as global } from '../util/global.js';
import domino from 'domino';
import srcMap from 'source-map-support';
import { dirname } from '../util/dirname.js';
srcMap.install();

/**
 * Partial Global used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on global.
 */
export interface QwikGlobal {
  /**
   * Document used by Qwik during rendering.
   */
  document: Document;
}

/**
 * Options when creating a mock Qwik Global object.
 */
export interface CreateGlobalOptions extends CreateDocumentOptions {}

/**
 * Options when creating a mock Qwik Document object.
 */
export interface CreateDocumentOptions {
  baseURI?: string;
}

/**
 * Create emulated `QwikGlobal` useful for testing.
 */
export function createGlobal(opts: CreateGlobalOptions = {}) {
  if ((global as any).CustomEvent === undefined) {
    (global as any).CustomEvent = MockCustomEvent as any;
  }
  return { document: createDocument(opts) };
}

/**
 * Create emulated `Document` in node environment.
 */
export function createDocument(opts: CreateDocumentOptions = {}): Document {
  const doc = domino.createDocument();
  // TODO(misko): Needs test
  const raf: MockRequestAnimationFrame = function (callback: FrameRequestCallback): number {
    const id = raf.queue.length;
    raf.queue[id] = callback;
    return id;
  };
  raf.queue = [];
  raf.flush = function () {
    const queue = raf.queue;
    for (let i = 0; i < queue.length; i++) {
      const callback = queue[i];
      if (callback) {
        queue[i] = null;
        callback(-1);
      }
    }
  };
  const window = { requestAnimationFrame: raf };

  if (typeof opts.baseURI !== 'string') {
    opts.baseURI = `http://testapp.qwik.dev/`;
  }

  Object.defineProperty(doc, 'baseURI', { value: opts.baseURI });
  Object.defineProperty(doc, 'defaultView', { value: window });
  return doc;
}

class MockCustomEvent {
  type: string;
  constructor(type: string, details: any) {
    Object.assign(this, details);
    this.type = type;
  }
}

/**
 * @public
 */
export interface MockRequestAnimationFrame {
  queue: (FrameRequestCallback | null)[];
  flush: () => void;
  (callback: FrameRequestCallback): number;
}
