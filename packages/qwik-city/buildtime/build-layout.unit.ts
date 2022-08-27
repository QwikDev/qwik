import { equal } from 'uvu/assert';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Layout');

test('total layouts', ({ layouts }) => {
  equal(layouts.length, 6, JSON.stringify(layouts, null, 2));
});

test('nested named layout', ({ assertLayout }) => {
  const l = assertLayout('ApiLayoutapi');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, 'api');
});

test('nested layout', ({ assertLayout }) => {
  const l = assertLayout('AuthLayout');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, '');
});

test('top layout', ({ assertLayout }) => {
  const l = assertLayout('DashboardLayout');
  equal(l.layoutType, 'top');
  equal(l.layoutName, '');
});

test('top layout', ({ assertLayout }) => {
  const l = assertLayout('DocsLayout');
  equal(l.layoutType, 'top');
  equal(l.layoutName, '');
});

test.run();
