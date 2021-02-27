/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { fail } from 'assert';
import { expect } from 'chai';
import { newError } from '../assert/index.js';
import { verifyQrl, QRL } from './qrl.js';

describe('QRL', () => {
  it('should verify QRL and fail on invalid', async () => {
    try {
      const qrl = await verifyQrl(newError(''), `./dontexist`);
      fail('Should throw error');
    } catch (e) {
      expect(String(e)).to.have.string('QRL-ERROR');
      expect(String(e)).to.have.string('dontexist');
      expect(String(e)).to.have.string('qrl.unit');
    }
  });

  it('should verify QRL and pass', async () => {
    try {
      const qrl = await verifyQrl(newError(''), `./qrl.QRL`);
      expect(qrl).to.equal(QRL);
    } catch (e) {
      console.log(e);
      fail('Expected to pass');
    }
  });
});
