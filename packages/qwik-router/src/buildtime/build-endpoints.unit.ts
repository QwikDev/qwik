import { equal } from 'uvu/assert';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Endpoints');

test('endpoint', ({ assertRoute }) => {
  const r = assertRoute('/api/data.json');
  equal(r.id, 'CommonApiDataRoute');
  equal(r.pattern, /^\/api\/data\.json\/?$/);
  equal(r.paramNames.length, 0);
});

test('endpoint w/ params', ({ assertRoute }) => {
  const r = assertRoute('/api/[org]/[user].json');
  equal(r.id, 'CommonApiOrgUserRoute');
  equal(r.pattern, /^\/api\/([^/]+?)\/([^/]+?)\.json\/?$/);
  equal(r.paramNames.length, 2);
  equal(r.paramNames[0], 'org');
  equal(r.paramNames[1], 'user');
});
