import { parseQRL, serializeQRL } from './qrl';
import { createQRL } from './qrl-class';
import { qrl } from './qrl';
import { describe, test, assert } from 'vitest';

function matchProps(obj: any, properties: Record<string, any>) {
  for (const [key, value] of Object.entries(properties)) {
    assert.deepEqual(obj[key], value, `${obj[key]} !== ${value}`);
  }
}

describe('serialization', () => {
  test('should parse', () => {
    matchProps(parseQRL('./chunk#default'), {
      $chunk$: './chunk',
      $symbol$: 'default',
      resolved: undefined,
    });
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

  test('serialize qrls', () => {
    assert.equal(serializeQRL(createQRL('./chunk', '', null, null, null, null, null)), 'chunk#');
    assert.equal(serializeQRL(createQRL('./c', 's1', null, null, null, null, null)), 'c#s1');
    assert.equal(serializeQRL(createQRL('./c', 's1', null, null, [], null, null)), 'c#s1');
    assert.equal(
      serializeQRL(createQRL('./c', 's1', null, null, [1, '2'] as any, null, null)),
      'c#s1[1 2]'
    );
    assert.equal(
      serializeQRL(createQRL('c', 's1', null, null, [1 as any, '2'], null, null)),
      'c#s1[1 2]'
    );
  });

  test('should parse reference', () => {
    const require = (str: string) => {
      console.warn(str);
    };
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

  // See https://github.com/BuilderIO/qwik/issues/5087#issuecomment-1707185010
  test.skip('should parse self-reference', () => {});

  test('should store resolved value', async () => {
    const q = qrl(() => Promise.resolve({ hi: 'hello' }), 'hi');
    assert.equal(q.resolved, undefined);
    await q.resolve();
    assert.equal(q.resolved, 'hello');
  });
});
