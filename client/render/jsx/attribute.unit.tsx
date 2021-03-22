/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { createGlobal } from '../../testing/node_utils.js';
import { ComponentFixture } from '../../testing/component_fixture.js';
import { applyAttributes } from './attributes.js';
import { jsxFactory } from './factory.js';

const _needed_by_JSX_ = jsxFactory;

describe('applyAttributes()', () => {
  let host: HTMLElement;
  beforeEach(() => {
    const global = createGlobal(import.meta.url);
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

  it.only('should remove properties to Element', () => {
    expect(applyAttributes(host, { a: '' }, false)).to.be.false;
    expect(host.outerHTML).to.equal('<host a=""></host>');
    expect(applyAttributes(host, { a: '' }, true)).to.be.false;
    expect(host.outerHTML).to.equal('<host a=""></host>');
    expect(applyAttributes(host, { a: null }, true)).to.be.true;
    expect(host.outerHTML).to.equal('<host></host>');
    expect(applyAttributes(host, { a: undefined! }, true)).to.be.true;
    expect(host.outerHTML).to.equal('<host></host>');
  });

  describe('$attrs', () => {
    it('should render $attr', async () => {
      const fixture = new ComponentFixture();
      let myValue: string | null = 'someItem:123:child:432';
      fixture.template = () => {
        return <test-component $myData={myValue} />;
      };
      await fixture.render();
      expect(fixture.host.innerHTML).to.equal(
        '<test-component bind:some-item:123:child:432="$myData"></test-component>'
      );
      myValue = 'otherItem';
      await fixture.render();
      expect(fixture.host.innerHTML).to.equal(
        '<test-component bind:other-item="$myData"></test-component>'
      );
      myValue = null;
      await fixture.render();
      expect(fixture.host.innerHTML).to.equal('<test-component bind:="$myData"></test-component>');
    });

    it('should merge bindings', async () => {
      const fixture = new ComponentFixture();
      let value1: string | null = 'someA';
      let value2: string | null = 'someB';
      fixture.template = () => {
        return <test-component $myA={value1} $myB={value2} />;
      };
      await fixture.render();
      expect(fixture.host.innerHTML).to.equal(
        '<test-component bind:some-a="$myA" bind:some-b="$myB"></test-component>'
      );
      value1 = 'same';
      value2 = 'same';
      await fixture.render();
      expect(fixture.host.innerHTML).to.equal(
        '<test-component bind:same="$myA|$myB"></test-component>'
      );
      value1 = null;
      value2 = null;
      await fixture.render();
      expect(fixture.host.innerHTML).to.equal(
        '<test-component bind:="$myA|$myB"></test-component>'
      );
    });
  });
});
