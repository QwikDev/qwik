/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import { stringifyDebug } from '../../error/stringify';
import { createDocument, ComponentFixture, ElementFixture } from '@builder.io/qwik/testing';
import { applyAttributes, setAttribute, stringifyClassOrStyle } from './attributes';

describe('attributes', () => {
  let host: HTMLElement;
  let input: HTMLInputElement;
  beforeEach(() => {
    const doc = createDocument();
    host = doc.createElement('host');
    input = doc.createElement('input');
  });

  describe('applyAttributes()', () => {
    it('should do nothing', () => {
      expect(applyAttributes(host, null, false)).toBe(false);
      expect(applyAttributes(host, null, true)).toBe(false);
      expect(applyAttributes(host, {}, false)).toBe(false);
      expect(applyAttributes(host, {}, true)).toBe(false);
    });

    it('should apply properties to Element', () => {
      expect(applyAttributes(host, { a: 'b' }, false)).toBe(false);
      expect(host.outerHTML).toEqual('<host a="b"></host>');
      expect(applyAttributes(host, { a: 'b' }, true)).toBe(false);
      expect(host.outerHTML).toEqual('<host a="b"></host>');
      expect(applyAttributes(host, { a: 'c' }, true)).toBe(true);
      expect(host.outerHTML).toEqual('<host a="c"></host>');
    });

    it('should remove properties from Element', () => {
      expect(applyAttributes(host, { a: '' }, false)).toBe(false);
      expect(host.outerHTML).toEqual('<host a=""></host>');
      expect(applyAttributes(host, { a: '' }, true)).toBe(false);
      expect(host.outerHTML).toEqual('<host a=""></host>');
      expect(applyAttributes(host, { a: null! }, true)).toBe(true);
      expect(host.outerHTML).toEqual('<host></host>');
      expect(applyAttributes(host, { a: undefined! }, true)).toBe(true);
      expect(host.outerHTML).toEqual('<host></host>');
    });

    describe('to input elements', () => {
      it('should write both attribute and `value` property', () => {
        expect(applyAttributes(input, { value: 'hello' }, false)).toBe(false);
        expect(input.value).toEqual('hello');
        expect(input.getAttribute('value')).toEqual('hello');

        expect(applyAttributes(input, { value: 'bar' }, false)).toBe(false);
        expect(input.value).toEqual('bar');
        expect(input.getAttribute('value')).toEqual('bar');

        input.value = 'baz';
        expect(applyAttributes(input, { value: 'hello' }, false)).toBe(false);
        expect(input.value).toEqual('hello');
        expect(input.getAttribute('value')).toEqual('hello');
      });
    });

    describe('innerHTML', () => {
      it('should deal with innerHTML', () => {
        expect(applyAttributes(host, { innerHTML: '<div>text</div>' }, false)).toBe(false);
        expect(host.outerHTML).toEqual('<host inner-h-t-m-l=""><div>text</div></host>');
      });
    });

    describe('$<attr> handling', () => {
      it('should render $<attr> binding', async () => {
        const fixture = new ComponentFixture();
        let myValue: string | null = 'someItem:123:child:432';
        <div></div>;
        fixture.template = () => {
          return <test-component $myData={myValue} />;
        };
        await fixture.render();
        expect(fixture.host.innerHTML).toEqual(
          '<test-component bind:some-item:123:child:432="$myData"></test-component>'
        );
        myValue = 'otherItem';
        await fixture.render();
        expect(fixture.host.innerHTML).toEqual(
          '<test-component bind:other-item="$myData"></test-component>'
        );
        myValue = null;
        await fixture.render();
        expect(fixture.host.innerHTML).toEqual('<test-component bind:="$myData"></test-component>');
      });

      it('should merge bindings', async () => {
        const fixture = new ComponentFixture();
        let value1: string | null = 'someA';
        let value2: string | null = 'someB';
        fixture.template = () => {
          return <test-component $myA={value1} $myB={value2} />;
        };
        await fixture.render();
        expect(fixture.host.innerHTML).toEqual(
          '<test-component bind:some-a="$myA" bind:some-b="$myB"></test-component>'
        );
        value1 = 'same';
        value2 = 'same';
        await fixture.render();
        expect(fixture.host.innerHTML).toEqual(
          '<test-component bind:same="$myA|$myB"></test-component>'
        );
        value1 = null;
        value2 = null;
        await fixture.render();
        expect(fixture.host.innerHTML).toEqual(
          '<test-component bind:="$myA|$myB"></test-component>'
        );
      });

      it('should detect binding change', async () => {
        const fixture = new ComponentFixture();
        expect(applyAttributes(fixture.host, { $propA: 'item:1' }, true)).toBe(true);
        expect(stringifyDebug(fixture.host)).toEqual(
          `<host : bind:item:1='$propA' decl:template='file://.../component_fixture.noop'>`
        );

        expect(applyAttributes(fixture.host, { $propA: 'item:1' }, true)).toBe(false);
        expect(stringifyDebug(fixture.host)).toEqual(
          `<host : bind:item:1='$propA' decl:template='file://.../component_fixture.noop'>`
        );

        expect(applyAttributes(fixture.host, { $propA: 'item:2' }, true)).toBe(true);
        expect(stringifyDebug(fixture.host)).toEqual(
          `<host : bind:item:2='$propA' decl:template='file://.../component_fixture.noop'>`
        );
      });
    });
  });

  describe('applyControlProperties', () => {
    it('should apply all on:* properties', () => {
      applyAttributes(
        host,
        {
          'on:click': 'url',
        },
        false
      );
      expect(host.getAttribute('on:.')).toEqual('');
      expect(host.getAttribute('on:click')).toEqual('url');
    });

    it('should apply on:* properties with camelCase', () => {
      applyAttributes(
        host,
        {
          'on:camelCase': 'url',
        },
        false
      );
      expect(host.getAttribute('on:.')).toEqual('');
      expect(host.getAttribute('on:camel-case')).toEqual('url');
    });

    it('should apply all entity bindings', () => {
      applyAttributes(
        host,
        {
          'decl:entity': [
            {
              $attachEntity: (element: Element) => {
                element.setAttribute('::entity', 'url');
              },
            } as any,
          ],
        },
        false
      );
      expect(host.getAttribute('::entity')).toEqual('url');
    });

    describe('error', () => {
      it('should error if services are not an array', () => {
        expect(() =>
          applyAttributes(
            host,
            {
              'decl:entity': 'notAnArray',
            },
            false
          )
        ).toThrow(`RENDER-ERROR(Q-603): Expecting array of entities, got 'notAnArray'.`);
      });
      it('should error if a entity does not have $attachEntity', () => {
        expect(() =>
          applyAttributes(
            host,
            {
              'decl:entity': [{ notEntity: true } as any],
            },
            false
          )
        ).toThrow(`RENDER-ERROR(Q-602): Expecting entity object, got '{"notEntity":true}'.`);
      });
    });
  });

  describe('stringifyClassOrStyle', () => {
    it('should return string', () => {
      expect(stringifyClassOrStyle('value', true)).toEqual('value');
      expect(stringifyClassOrStyle(null!, true)).toEqual('');
    });
    it('should turn into class', () => {
      expect(stringifyClassOrStyle(['a', 'b'], true)).toEqual('a b');
      expect(stringifyClassOrStyle({ a: true, b: false }, true)).toEqual('a');
    });
    it('should turn into style', () => {
      expect(stringifyClassOrStyle({ a: true, b: false }, false)).toEqual('a:true;b:false');
    });
    describe('error', () => {
      it('should complain on setting array on style', () => {
        expect(() => stringifyClassOrStyle(['a', 'b'], false)).toThrow(
          `RENDER-ERROR(Q-601): Value '["a","b"]' can't be written into 'style' attribute.`
        );
      });
    });
  });
  describe('setAttribute', () => {
    let fixture: ElementFixture;
    beforeEach(() => {
      fixture = new ElementFixture({ tagName: 'input' });
    });

    it('should set/remove attribute', () => {
      setAttribute(fixture.host, 'id', 'value');
      expect(fixture.host.getAttribute('id')).toEqual('value');
      setAttribute(fixture.host, 'id', null);
      expect(fixture.host.hasAttribute('id')).toBe(false);
    });

    it('should set class', () => {
      setAttribute(fixture.host, 'class', ['a', 'b']);
      expect(fixture.host.getAttribute('class')).toEqual('a b');
    });

    it('should set style', () => {
      setAttribute(fixture.host, 'style', { color: 'red', width: '10px' });
      expect(fixture.host.getAttribute('style')).toEqual('color:red;width:10px');
    });

    it('should set INPUT properties', () => {
      fixture.host.setAttribute('value', 'initial');
      setAttribute(fixture.host, 'value', 'update');
      expect((fixture.host as HTMLInputElement).value).toEqual('update');
    });

    describe('error', () => {
      it('should complain on setting array on style', () => {
        expect(() => setAttribute(fixture.host, 'style', ['a', 'b'])).toThrow(
          `RENDER-ERROR(Q-601): Value '["a","b"]' can't be written into 'style' attribute.`
        );
      });
    });
  });
});
