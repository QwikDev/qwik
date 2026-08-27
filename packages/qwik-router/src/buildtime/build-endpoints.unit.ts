import { assert } from 'vitest';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Endpoints');

test('endpoint', ({ assertRoute }) => {
  const r = assertRoute('/api/data.json');
  assert.deepEqual(r.id, 'CommonApiDataRoute');
  assert.deepEqual(r.pattern, /^\/api\/data\.json\/?$/);
  assert.deepEqual(r.paramNames.length, 0);
});

test('endpoint w/ params', ({ assertRoute }) => {
  const r = assertRoute('/api/[org]/[user].json');
  assert.deepEqual(r.id, 'CommonApiOrgUserRoute');
  assert.deepEqual(r.pattern, /^\/api\/([^/]+?)\/([^/]+?)\.json\/?$/);
  assert.deepEqual(r.paramNames.length, 2);
  assert.deepEqual(r.paramNames[0], 'org');
  assert.deepEqual(r.paramNames[1], 'user');
});
