/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type {
  CreateDocumentOptions,
  CreateGlobalOptions,
  MockDocument,
  MockGlobal,
  MockRequestAnimationFrame,
} from './types';
import domino from 'domino';
import srcMap from 'source-map-support';
srcMap.install();

/**
 * Create emulated `QwikGlobal` useful for testing.
 */
export function createGlobal(opts: CreateGlobalOptions = {}): MockGlobal {
  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = MockCustomEvent as any;
  }
  const doc = createDocument(opts);
  const gbl = doc.defaultView!;
  return {
    document: doc,
    requestAnimationFrame: gbl.requestAnimationFrame,
    cancelAnimationFrame: gbl.cancelAnimationFrame,
  } as any;
}

/**
 * Create emulated `Document` in node environment.
 */
export function createDocument(opts: CreateDocumentOptions = {}): MockDocument {
  const doc: MockDocument = domino.createDocument() as any;
  // TODO(misko): Needs test
  const raf: MockRequestAnimationFrame = function requestAnimationFrame(
    callback: FrameRequestCallback
  ): number {
    const id = raf.queue.length;
    raf.queue[id] = callback;
    return id;
  };
  raf.queue = [];
  raf.flush = async function () {
    await Promise.resolve();
    const queue = raf.queue;
    for (let i = 0; i < queue.length; i++) {
      const callback = queue[i];
      if (callback) {
        queue[i] = null;
        callback(-1);
      }
    }
  };

  const cancelRaf = function cancelAnimationFrame(i: number) {
    raf.queue[i] = null;
  };

  const defaultView = { requestAnimationFrame: raf, cancelAnimationFrame: cancelRaf };

  if (typeof opts.baseURI !== 'string') {
    opts.baseURI = `http://testingutils.qwik.dev/`;
  }
  Object.defineProperty(doc, 'baseURI', { value: opts.baseURI });
  Object.defineProperty(doc, 'defaultView', { value: defaultView });
  return doc;
}

class MockCustomEvent {
  type: string;
  constructor(type: string, details: any) {
    Object.assign(this, details);
    this.type = type;
  }
}
