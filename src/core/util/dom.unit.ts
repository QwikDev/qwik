/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { createGlobal, QwikGlobal } from '../testing/node_utils.js';
import { isDomElementWithTagName } from './types.js';

describe('dom', () => {
  let global: QwikGlobal;
  let div: HTMLElement;
  let span: HTMLElement;
  let text: Text;
  beforeEach(() => {
    global = createGlobal(import.meta.url);
    div = global.document.createElement('div');
    span = global.document.createElement('span');
    text = global.document.createTextNode('text-node');
  });

  it('isDomElementWithTagName', () => {
    expect(isDomElementWithTagName(null, 'dIv')).to.equal(false);
    expect(isDomElementWithTagName(span, 'dIv')).to.equal(false);
    expect(isDomElementWithTagName(text, 'dIv')).to.equal(false);

    expect(isDomElementWithTagName(div, 'dIv')).to.equal(true);
  });
});
