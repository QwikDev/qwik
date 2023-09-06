import { parseQRL, serializeQRL } from './qrl';
import { createQRL } from './qrl-class';
import { qrl } from './qrl';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';

const qrlSuite = suite('serialization');

qrlSuite('should parse', () => {
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

qrlSuite('serialize qrls', () => {
  equal(serializeQRL(createQRL('./chunk', '', null, null, null, null, null)), 'chunk#');
  equal(serializeQRL(createQRL('./c', 's1', null, null, null, null, null)), 'c#s1');
  equal(serializeQRL(createQRL('./c', 's1', null, null, [], null, null)), 'c#s1');
  equal(serializeQRL(createQRL('./c', 's1', null, null, [1, '2'] as any, null, null)), 'c#s1[1 2]');
  equal(serializeQRL(createQRL('c', 's1', null, null, [1 as any, '2'], null, null)), 'c#s1[1 2]');
});

qrlSuite('should parse reference', () => {
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
qrlSuite('should parse self-reference', () => {});

qrlSuite('should store resolved value', async () => {
  const q = qrl(() => Promise.resolve({ hi: 'hello' }), 'hi');
  equal(q.resolved, undefined);
  await q.resolve();
  equal(q.resolved, 'hello');
});

function matchProps(obj: any, properties: Record<string, any>) {
  for (const [key, value] of Object.entries(properties)) {
    equal(obj[key], value, `${obj[key]} !== ${value}`);
  }
}

qrlSuite.run();
