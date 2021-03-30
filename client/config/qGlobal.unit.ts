/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { getConfig, getQRLProtocolMap, setConfig } from './qGlobal.js';

describe('getQRLProtocolMap', () => {
  it('should create protocol', () => {
    const protocol = getQRLProtocolMap();
    expect(Q.protocol).to.be.equal(protocol);
  });

  it('should convert file path to file://', () => {
    setConfig({
      baseURI: '/test/path/file',
      protocol: {},
    });
    const config = getConfig('file:///test/path/child');
    expect(config.baseURI).to.equal('file:///test/path/');
    const config2 = getConfig('/test/path/child');
    expect(config2.baseURI).to.equal('file:///test/path/');
  });
});
