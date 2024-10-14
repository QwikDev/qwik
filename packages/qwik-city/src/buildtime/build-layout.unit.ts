import { assert, testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Layout');

test('total layouts', ({ ctx: { layouts } }) => {
  assert.equal(layouts.length, 11, JSON.stringify(layouts, null, 2));
});

test('nested named layout', ({ assertLayout }) => {
  const l = assertLayout('CommonApiLayoutapi');
  assert.equal(l.layoutType, 'nested');
  assert.equal(l.layoutName, 'api');
});

test('nested layout', ({ assertLayout }) => {
  const l = assertLayout('CommonAuthLayout');
  assert.equal(l.layoutType, 'nested');
  assert.equal(l.layoutName, '');
});
