import * as assert from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';

const test = testAppSuite('Build Endpoints');

test('endpoint', ({ assertEndpoint }) => {
  const r = assertEndpoint('/api/data.json');
  assert.equal(r.id, 'ApiDatajson');
  assert.equal(r.type, 'endpoint');
  assert.equal(r.pattern, /^\/api\/data\.json$/);
  assert.equal(r.paramNames.length, 0);
});

test('endpoint w/ params', ({ assertEndpoint }) => {
  const r = assertEndpoint('/api/[org]/[user].json');
  assert.equal(r.id, 'ApiOrgUserjsonIndex');
  assert.equal(r.type, 'endpoint');
  assert.equal(r.pattern, /^\/api\/([^/]+?)\/([^/]+?)\.json$/);
  assert.equal(r.paramNames.length, 2);
  assert.equal(r.paramNames[0], 'org');
  assert.equal(r.paramNames[1], 'user');
});

test.run();
