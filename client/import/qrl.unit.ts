/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import '../CONFIG.js';
import { expect } from 'chai';
import { newError } from '../assert/index.js';
import { verifyQrl, QRL } from './qrl.js';
import { dirname } from '../util/dirname.js';

describe('QRL', () => {
  it('should verify QRL and fail on invalid', async () => {
    try {
      await verifyQrl(newError(''), `./dontexist`);
      expect('Should throw error').to.be.false;
    } catch (e) {
      expect(String(e)).to.have.string('QRL-ERROR');
      expect(String(e)).to.have.string('dontexist');
      expect(String(e)).to.have.string('qrl.unit');
    }
  });

  it('should verify QRL and pass', async () => {
    try {
      const qrl = await verifyQrl(newError(''), `./import/qrl#QRL`);
      expect(qrl).to.equal(QRL);
    } catch (e) {
      expect(e).to.be.false;
    }
  });

  it('should support custom protocols', async () => {
    try {
      const qrl = await verifyQrl(newError(''), String(QRL`import:/qrl#QRL`));
      expect(qrl).to.equal(QRL);
    } catch (e) {
      expect(e).to.be.false;
    }
  });

  it('should strip filename and keep ending slash', () => {
    expect(dirname('dir/path/file.ext')).to.equal('dir/path/');
  });
});
