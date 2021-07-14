/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { createDocument, MockDocument } from '@builder.io/qwik/testing';
import { h } from './factory';
import { jsxRender } from './render';

describe('legacy jsxFactory render', () => {
  let doc: MockDocument;
  let host: HTMLElement;

  beforeEach(() => {
    doc = createDocument();
    host = doc.createElement('host');
  });

  it('empty div', () => {
    jsxRender(host, h('div', null));
    expect(host.innerHTML).toEqual('<div></div>');
  });

  it('div w/ array of text', () => {
    const val = 'b';
    jsxRender(host, h('div', null, 'a', val, 'c'));
    expect(host.innerHTML).toEqual('<div>abc</div>');
  });

  it('div w/ child elements', () => {
    jsxRender(host, h('div', null, h('span', null, 'a'), h('span', null, 'b')));
    expect(host.innerHTML).toEqual('<div><span>a</span><span>b</span></div>');
  });
});
