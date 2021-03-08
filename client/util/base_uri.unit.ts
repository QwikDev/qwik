/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { getBaseUri } from './base_uri.js';

describe('getBaseUri', () => {
  it('should get this file', () => {
    expect(getBaseUri()).to.include('base_uri.unit.js');
  });
  it('should getBaseUri equal import.meta.url', () => {
    expect(getBaseUri()).to.equal(import.meta.url);
  });
});
