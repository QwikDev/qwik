import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { extractParamNames } from './extract-params';

const routeMatchSuite = suite('extractParamNames');

routeMatchSuite('should parse no params', () => {
  equal(extractParamNames('/a/b/c'), []);
});

routeMatchSuite('should parse one param', () => {
  equal(extractParamNames('/a/[b]/[c]'), ['b', 'c']);
});

routeMatchSuite('should parse param in mid urls', () => {
  equal(extractParamNames('/a/pre[b]post/pre[c]/[d]post'), ['b', 'c', 'd']);
});

routeMatchSuite('should parse rest param', () => {
  equal(extractParamNames('/a/[...b]'), ['b']);
});

routeMatchSuite.run();
