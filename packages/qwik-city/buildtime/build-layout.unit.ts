import { equal } from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';

const test = testAppSuite('Build Layout');

test('total layouts', ({ layouts }) => {
  equal(layouts.length, 6, JSON.stringify(layouts, null, 2));
});

test('nested named layout', ({ assertLayout }) => {
  const l = assertLayout('ApiLayoutfoo');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, 'foo');
});

test('nested layout', ({ assertLayout }) => {
  const l = assertLayout('AuthLayout');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, '');
});

test('named nested layout', ({ assertLayout }) => {
  const l = assertLayout('DashboardLayoutdashboard');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, 'dashboard');
});

test('named nested layout', ({ assertLayout }) => {
  const l = assertLayout('DashboardLayoutdashboard');
  equal(l.layoutType, 'nested');
  equal(l.layoutName, 'dashboard');
});

test('top layout', ({ assertLayout }) => {
  const l = assertLayout('DocsLayout');
  equal(l.layoutType, 'top');
  equal(l.layoutName, '');
});

test.run();
