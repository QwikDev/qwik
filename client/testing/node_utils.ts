/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { default as global } from '../util/global.js';
import domino from 'domino';
import srcMap from 'source-map-support';
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
 * Create emulated `QwikGlobal` useful for testing.
 */
export function createGlobal(baseUri: string) {
  if ((global as any).CustomEvent === undefined) {
    (global as any).CustomEvent = MockCustomEvent as any;
  }
  return { document: createDocument(baseUri) };
}

/**
 * Create emulated `Document` in node environment.
 */
export function createDocument(baseUri: string): Document {
  const document = domino.createDocument();
  // TODO(misko): Needs test
  const requestAnimationFrame: MockRequestAnimationFrame = function requestAnimationFrame(
    callback: FrameRequestCallback
  ): number {
    const id = requestAnimationFrame.queue.length;
    requestAnimationFrame.queue[id] = callback;
    return id;
  };
  requestAnimationFrame.queue = [];
  requestAnimationFrame.flush = function () {
    const queue = requestAnimationFrame.queue;
    for (let i = 0; i < queue.length; i++) {
      const callback = queue[i];
      if (callback) {
        queue[i] = null;
        callback(-1);
      }
    }
  };
  const window = { requestAnimationFrame };
  Object.defineProperty(document, 'baseURI', { value: baseUri });
  Object.defineProperty(document, 'defaultView', { value: window });
  return document;
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
