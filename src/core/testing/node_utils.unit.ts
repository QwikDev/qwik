/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';

import { createGlobal } from './node_utils.js';

describe('node', () => {
  it('should create document', () => {
    const global = createGlobal({
      baseURI: import.meta.url,
    });
    expect(global.document.baseURI).to.have.string('node_utils.unit');
  });
});
