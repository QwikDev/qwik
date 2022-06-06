import * as assert from 'uvu/assert';
import * as utils from './fs';
import { suite } from './tests/test-suite';

const test = suite();

test('js module / path', () => {
  const p = utils.getPagesBuildPath('/');
  assert.is(p, 'pages/index.js');
});

test('js module /basics path', () => {
  const p = utils.getPagesBuildPath('/basics');
  assert.is(p, 'pages/basics/index.js');
});

test('js module /basics/index path', () => {
  const p = utils.getPagesBuildPath('/basics/index');
  assert.is(p, 'pages/basics/index.js');
});

test.run();
