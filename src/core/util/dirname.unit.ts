/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { dirname } from './dirname.js';

describe('dirname', () => {
  it('should strip filename and keep ending slash', () => {
    expect(dirname('dir/path/file.ext')).to.equal('dir/path/');
  });

  it('should strip dirname and keep ending slash', () => {
    expect(dirname('dir/path/')).to.equal('dir/');
  });
});
