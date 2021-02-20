/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { createGlobal } from '../../testing/node_utils.js';
import { applyAttributes } from './attributes.js';

describe('applyAttributes()', () => {
  let host: HTMLElement;
  beforeEach(() => {
    const global = createGlobal();
    host = global.document.createElement('host');
  });

  it('should do nothing', () => {
    expect(applyAttributes(host, null, false)).to.be.false;
    expect(applyAttributes(host, null, true)).to.be.false;
    expect(applyAttributes(host, {}, false)).to.be.false;
    expect(applyAttributes(host, {}, true)).to.be.false;
  });

  it('should apply properties to Element', () => {
    expect(applyAttributes(host, { a: 'b' }, false)).to.be.false;
    expect(host.outerHTML).to.equal('<host a="b"></host>');
    expect(applyAttributes(host, { a: 'b' }, true)).to.be.false;
    expect(host.outerHTML).to.equal('<host a="b"></host>');
    expect(applyAttributes(host, { a: 'c' }, true)).to.be.true;
    expect(host.outerHTML).to.equal('<host a="c"></host>');
  });

  it('should remove properties to Element', () => {
    expect(applyAttributes(host, { a: '' }, false)).to.be.false;
    expect(host.outerHTML).to.equal('<host a=""></host>');
    expect(applyAttributes(host, { a: '' }, true)).to.be.false;
    expect(host.outerHTML).to.equal('<host a=""></host>');
    expect(applyAttributes(host, { a: null }, true)).to.be.true;
    expect(host.outerHTML).to.equal('<host></host>');
    expect(applyAttributes(host, { a: undefined }, true)).to.be.false;
    expect(host.outerHTML).to.equal('<host></host>');
  });
});
