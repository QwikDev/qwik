/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { getQRLProtocolMap } from './qGlobal.js';

describe('getQRLProtocolMap', () => {
  it('should create protocol', () => {
    const protocol = getQRLProtocolMap();
    expect(Q.protocol).to.be.equal(protocol);
  });
});
