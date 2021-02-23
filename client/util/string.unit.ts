/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { caseInsensitiveCompare } from './string.js';

describe('string', () => {
  it('should caseInsensitiveCompare', () => {
    expect(caseInsensitiveCompare(null, null)).to.equal(false);
    expect(caseInsensitiveCompare('a', null)).to.equal(false);
    expect(caseInsensitiveCompare(null, 'b')).to.equal(false);
    expect(caseInsensitiveCompare('a', 'bb')).to.equal(false);

    expect(caseInsensitiveCompare('a', 'a')).to.equal(true);
    expect(caseInsensitiveCompare('aBc', 'AbC')).to.equal(true);
  });
});
