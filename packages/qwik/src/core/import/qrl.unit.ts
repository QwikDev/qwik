import { parseQRL, stringifyQRL } from './qrl';
import { createQrl } from './qrl-class';
import { qrl } from './qrl';

describe('QRL', () => {
  describe('serialization', () => {
    it('should parse', () => {
      matchProps(parseQRL('./chunk'), { $chunk$: './chunk', $symbol$: 'default' });
      matchProps(parseQRL('./chunk#mySymbol'), {
        $chunk$: './chunk',
        $symbol$: 'mySymbol',
      });
      matchProps(parseQRL('./chunk#mySymbol'), {
        $chunk$: './chunk',
        $symbol$: 'mySymbol',
      });
      matchProps(parseQRL('./chunk#s1'), {
        $chunk$: './chunk',
        $symbol$: 's1',
        $capture$: [],
      });
      matchProps(parseQRL('./chunk#s1[1 b]'), {
        $chunk$: './chunk',
        $symbol$: 's1',
        $capture$: ['1', 'b'],
      });
      matchProps(parseQRL('./chunk#s1[1 b]'), {
        $chunk$: './chunk',
        $symbol$: 's1',
        $capture$: ['1', 'b'],
      });
      matchProps(parseQRL('./chunk#s1[1 b]'), {
        $chunk$: './chunk',
        $symbol$: 's1',
        $capture$: ['1', 'b'],
      });
      matchProps(parseQRL('./chunk[1 b]'), {
        $chunk$: './chunk',
        $capture$: ['1', 'b'],
      });
      matchProps(parseQRL('./path#symbol[2]'), {
        $chunk$: './path',
        $symbol$: 'symbol',
        $capture$: ['2'],
      });
    });

    it('should stringify', () => {
      expect(stringifyQRL(createQrl('./chunk', '', null, null, null, null, null))).toEqual(
        './chunk'
      );
      expect(stringifyQRL(createQrl('./c', 's1', null, null, null, null, null))).toEqual('./c#s1');
      expect(stringifyQRL(createQrl('./c', 's1', null, null, [], null, null))).toEqual('./c#s1');
      expect(stringifyQRL(createQrl('./c', 's1', null, null, [1, '2'] as any, null, null))).toEqual(
        './c#s1[1 2]'
      );
      expect(stringifyQRL(createQrl('./c', 's1', null, null, [1 as any, '2'], null, null))).toEqual(
        './c#s1[1 2]'
      );
    });
  });

  describe('qrl', () => {
    it('should parse reference', () => {
      matchProps(
        qrl(
          () =>
            Promise.resolve().then(function () {
              return require('./h_my-app_myapp_init-73253fd4.js');
            }),
          'MyApp_init'
        ),
        {
          $chunk$: './h_my-app_myapp_init-73253fd4.js',
          $symbol$: 'MyApp_init',
        }
      );
    });
    it('should parse self-reference', () => {});
  });
});

function matchProps(obj: any, properties: Record<string, any>) {
  for (const [key, value] of Object.entries(properties)) {
    expect(obj[key]).toEqual(value);
  }
}
