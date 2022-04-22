import { parseQRL, stringifyQRL } from './qrl';
import { QRLInternal } from './qrl-class';
import { qrl } from './qrl';

describe('QRL', () => {
  describe('serialization', () => {
    it('should parse', () => {
      expect(parseQRL('./chunk')).toMatchObject({ chunk: './chunk', symbol: 'default' });
      expect(parseQRL('./chunk#mySymbol')).toMatchObject({ chunk: './chunk', symbol: 'mySymbol' });
      expect(parseQRL('./chunk#mySymbol')).toMatchObject({ chunk: './chunk', symbol: 'mySymbol' });
      expect(parseQRL('./chunk#s1')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        capture: [],
      });
      expect(parseQRL('./chunk#s1[1 b]')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        capture: ['1', 'b'],
      });
      expect(parseQRL('./chunk#s1[1 b]')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        capture: ['1', 'b'],
      });
      expect(parseQRL('./chunk#s1[1 b]')).toMatchObject({
        chunk: './chunk',
        symbol: 's1',
        capture: ['1', 'b'],
      });
      expect(parseQRL('./chunk[1 b]')).toMatchObject({
        chunk: './chunk',
        capture: ['1', 'b'],
      });
      expect(parseQRL('./path#symbol[2]')).toMatchObject({
        chunk: './path',
        symbol: 'symbol',
        capture: ['2'],
      });
    });

    it('should stringify', () => {
      expect(stringifyQRL(new QRLInternal('./chunk', '', null, null, null, null))).toEqual(
        './chunk'
      );
      expect(stringifyQRL(new QRLInternal('./c', 's1', null, null, null, null))).toEqual('./c#s1');
      expect(stringifyQRL(new QRLInternal('./c', 's1', null, null, [], null))).toEqual('./c#s1');
      expect(stringifyQRL(new QRLInternal('./c', 's1', null, null, [1, '2'] as any, null))).toEqual(
        './c#s1[1 2]'
      );
      expect(stringifyQRL(new QRLInternal('./c', 's1', null, null, [1 as any, '2'], null))).toEqual(
        './c#s1[1 2]'
      );
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
