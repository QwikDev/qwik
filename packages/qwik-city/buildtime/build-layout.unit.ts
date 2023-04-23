import { equal } from 'uvu/assert';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Layout');

test('total layouts', ({ layouts }) => {
  equal(layouts.length, 8, JSON.stringify(layouts, null, 2));
});

test('nested named layout', ({ assertLayout }) => {
  const l = assertLayout('CommonApiLayoutapi');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, 'api');
});

test('nested layout', ({ assertLayout }) => {
  const l = assertLayout('CommonAuthLayout');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, '');
});

test.run();
