/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { createGlobal, MockGlobal } from '@builder.io/qwik/testing';
import { isDomElementWithTagName } from './types';

describe('dom', () => {
  let global: MockGlobal;
  let div: HTMLElement;
  let span: HTMLElement;
  let text: Text;
  beforeEach(() => {
    global = createGlobal();
    div = global.document.createElement('div');
    span = global.document.createElement('span');
    text = global.document.createTextNode('text-node');
  });

  it('isDomElementWithTagName', () => {
    expect(isDomElementWithTagName(null, 'dIv')).toEqual(false);
    expect(isDomElementWithTagName(span, 'dIv')).toEqual(false);
    expect(isDomElementWithTagName(text, 'dIv')).toEqual(false);
    expect(isDomElementWithTagName(div, 'dIv')).toEqual(true);
  });
});
