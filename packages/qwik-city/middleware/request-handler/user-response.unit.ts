import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { mockRequestContext, wait } from './test-utils';
import type { EndpointModule } from '../../runtime/src/library/types';
import { loadUserResponse } from './user-response';

test('sync endpoint, undefined body', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;
  const isEndpointOnly = true;

  const endpoints: EndpointModule[] = [
    {
      onGet: ({ response }) => {
        response.status = 204;
        response.headers.append('name', 'value');
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 204);
  assert.equal(u.headers.get('name'), 'value');
  assert.equal(u.pendingBody, undefined);
  assert.equal(u.resolvedBody, undefined);
});

test('async endpoint, resolved data, render blocking', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;
  const isEndpointOnly = false;

  const endpoints: EndpointModule[] = [
    {
      onGet: async ({ response }) => {
        await wait();
        response.status = 204;
        response.headers.append('name', 'value');
        return { mph: 88 };
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 204);
  assert.equal(u.headers.get('name'), 'value');
  assert.equal(u.pendingBody, undefined);
  assert.equal(u.resolvedBody, { mph: 88 });
});

test('onPost priority over onRequest, dont call onGet', async () => {
  const requestCtx = mockRequestContext({ method: 'POST' });
  const trailingSlash = false;
  const isEndpointOnly = true;

  let calledOnGet = false;
  let calledOnPost = false;
  let calledOnRequest = false;
  const endpoints: EndpointModule[] = [
    {
      onGet: async () => {
        await wait();
        calledOnGet = true;
      },
      onPost: async () => {
        await wait();
        calledOnPost = true;
      },
      onRequest: () => {
        calledOnRequest = true;
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 200);
  assert.equal(calledOnGet, false);
  assert.equal(calledOnPost, true);
  assert.equal(calledOnRequest, false);
});

test('catchall onRequest', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;
  const isEndpointOnly = true;

  let calledOnRequest = false;
  const endpoints: EndpointModule[] = [
    {
      onRequest: async () => {
        await wait();
        calledOnRequest = true;
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 200);
  assert.equal(calledOnRequest, true);
});

test('user redirect', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;
  const isEndpointOnly = false;

  const endpoints: EndpointModule[] = [
    {
      onRequest: async ({ response }) => {
        await wait();
        response.status = 307;
        response.headers.set('Location', '/redirect');
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 307);
  assert.equal(u.headers.get('Location'), '/redirect');
  assert.equal(u.isEndpointOnly, true);
});

test('redirect', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;
  const isEndpointOnly = true;

  const endpoints: EndpointModule[] = [
    {
      onRequest: async ({ response }) => {
        await wait();
        response.redirect('/redirect');
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 307);
  assert.equal(u.headers.get('Location'), '/redirect');
  assert.equal(u.isEndpointOnly, true);
});

test('no handler for endpoint', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;
  const isEndpointOnly = true;
  const endpointModules: EndpointModule[] = [{ onDelete: () => {} }, { onPost: () => {} }, {}];
  const u = await loadUserResponse(requestCtx, {}, endpointModules, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 405);
});

test('remove trailing slash', async () => {
  const requestCtx = mockRequestContext({ url: '/somepath/' });
  const trailingSlash = false;
  const isEndpointOnly = false;
  const endpointModules: EndpointModule[] = [];
  const u = await loadUserResponse(requestCtx, {}, endpointModules, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 308);
  assert.equal(u.headers.get('Location'), '/somepath');
});

test('add trailing slash', async () => {
  const requestCtx = mockRequestContext({ url: '/somepath?qs=true' });
  const trailingSlash = true;
  const isEndpointOnly = false;
  const endpointModules: EndpointModule[] = [];
  const u = await loadUserResponse(requestCtx, {}, endpointModules, trailingSlash, isEndpointOnly);
  assert.equal(u.status, 308);
  assert.equal(u.headers.get('Location'), '/somepath/?qs=true');
});

test.run();
