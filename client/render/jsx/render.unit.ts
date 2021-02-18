/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {expect} from 'chai';

import {jsxRender} from './render.js';

describe('render', () => {
  it('should render HTML tag on document', () => {
    expect(jsxRender).to.a('function');
    expect(jsxRender).to.a('string');
  });
});