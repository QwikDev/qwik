/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { parseQRL, stringifyQRL } from './qrl';
import { QRLClass } from './qrl-class';
import { qrl } from './qrl.public';

describe('QRL', () => {
  describe('serialization', () => {
    it('should parse', () => {
      expect(parseQRL('./chunk')).toMatchObject({ chunk: './chunk', symbol: 'default' });
      expect(parseQRL('./chunk#mySymbol')).toMatchObject({ chunk: './chunk', symbol: 'mySymbol' });
      expect(parseQRL('./chunk#mySymbol')).toMatchObject({ chunk: './chunk', symbol: 'mySymbol' });
      expect(parseQRL('./chunk#s1|a.propA|b.propB.propC')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        guard: new Map([
          ['a', ['propA']],
          ['b', ['propB', 'propC']],
        ]),
      });
      expect(parseQRL('./chunk#s1[1,"b"]')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        capture: [1, 'b'],
      });
      expect(parseQRL('./chunk#s1|a|[1,"b"]')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        guard: new Map([['a', []]]),
        capture: [1, 'b'],
      });
      expect(parseQRL('./chunk#s1|a[1,"b"]')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        guard: new Map([['a', []]]),
        capture: [1, 'b'],
      });
      expect(parseQRL('./chunk[1,"b"]')).toMatchObject({
        chunk: './chunk',
        capture: [1, 'b'],
      });
      expect(parseQRL('./path#symbol[{"foo": "bar"}]')).toMatchObject({
        chunk: './path',
        symbol: 'symbol',
        capture: [{ foo: 'bar' }],
        guard: null,
      });
    });

    it('should stringify', () => {
      expect(stringifyQRL(new QRLClass('./chunk', '', null, null, null, null, null, null))).toEqual(
        './chunk'
      );
      expect(stringifyQRL(new QRLClass('./c', 's1', null, null, null, null, null, null))).toEqual(
        './c#s1'
      );
      expect(stringifyQRL(new QRLClass('./c', 's1', null, null, [], null, null, null))).toEqual(
        './c#s1'
      );
      expect(
        stringifyQRL(new QRLClass('./c', 's1', null, null, [1, '2'] as any, null, null, null))
      ).toEqual('./c#s1[1,"2"]');
      expect(
        stringifyQRL(
          new QRLClass(
            './c',
            's1',
            null,
            null,
            [1 as any, '2'],
            null,
            new Map([
              ['a', []],
              ['b', ['c']],
              ['c', ['d', 'e']],
            ]),
            null
          )
        )
      ).toEqual('./c#s1|a|b.c|c.d.e[1,"2"]');
    });
  });

  describe('qrl', () => {
    it('should parse reference', () => {
      expect(
        qrl(
          () =>
            Promise.resolve().then(function () {
              return require('./h_my-app_myapp_init-73253fd4.js');
            }),
          'MyApp_init'
        )
      ).toMatchObject({
        chunk: './h_my-app_myapp_init-73253fd4.js',
        symbol: 'MyApp_init',
      });
    });
    it('should parse self-reference', () => {});
  });
});
