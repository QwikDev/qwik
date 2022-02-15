import * as assert from 'uvu/assert';
import { test } from 'uvu';
import * as plugin from '../vite/plugin';

test('test', () => {
  assert.type({}, 'object');
});

test.run();
