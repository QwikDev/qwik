/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import domino from 'domino';
import srcMap from 'source-map-support';
srcMap.install();

/**
 * Partial Global used by Qoot Framework.
 *
 * A set of properties which the Qoot Framework expects to find on global.
 */
export interface QootGlobal {
  /**
   * Document used by Qoot during rendering.
   */
  document: Document;
}

/**
 * Create emulated `QootGlobal` useful for testing.
 */
export function createGlobal() {
  return { document: createDocument() };
}

/**
 * Create emulated `Document` in node environment.
 */
export function createDocument(): Document {
  return domino.createDocument();
}
