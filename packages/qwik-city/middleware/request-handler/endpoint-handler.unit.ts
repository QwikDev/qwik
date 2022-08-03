import type { EndpointModule } from '../../runtime/src/library/types';
import { test } from 'uvu';
import { equal, instance } from 'uvu/assert';
import { mockRequestContext, wait } from './test-utils';
import { loadUserResponse } from './user-response';
import { endpointHandler } from './endpoint-handler';

test('onRequest, async return callback, async callback data', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: async ({ response }) => {
        response.status = 204;
        await wait();
        return async () => {
          await wait();
          return 88;
        };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  instance(userResponse.pendingBody, Promise);
  equal(userResponse.resolvedBody, undefined);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 204);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `88`);
});

test('onRequest, async return callback, sync callback data', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: async ({ response }) => {
        response.status = 204;
        await wait();
        return () => {
          return 88;
        };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  instance(userResponse.pendingBody, Promise);
  equal(userResponse.resolvedBody, undefined);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 204);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `88`);
});

test('onRequest, sync return callback, async callback data', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: ({ response }) => {
        response.status = 204;
        return async () => {
          await wait();
          return 88;
        };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  instance(userResponse.pendingBody, Promise);
  equal(userResponse.resolvedBody, undefined);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 204);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `88`);
});

test('onRequest, sync return callback, sync callback data', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: ({ response }) => {
        response.status = 204;
        return () => {
          return 88;
        };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  instance(userResponse.pendingBody, Promise);
  equal(userResponse.resolvedBody, undefined);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 204);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `88`);
});

test('onRequest, sync return number', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: () => {
        return 88;
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, 88);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');

  equal(await responseData.body, `88`);
});

test('onRequest, async return string', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: async () => {
        await wait();
        return 'mph';
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, `mph`);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `"mph"`);
});

test('onRequest, sync return string', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: () => {
        return 'mph';
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, `mph`);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `"mph"`);
});

test('onRequest, async return object', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: async () => {
        await wait();
        return { mph: 88 };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, { mph: 88 });

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `{"mph":88}`);
});

test('onRequest, sync return object', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onRequest: () => {
        return { mph: 88 };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, { mph: 88 });

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `{"mph":88}`);
});

test('onGet preference over onRequest', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  let calledOnGet = false;
  let calledOnRequest = false;
  const endpointModules: EndpointModule[] = [
    {
      onGet: () => {
        calledOnGet = true;
      },
      onRequest: () => {
        calledOnRequest = true;
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);
  await endpointHandler(requestCtx, userResponse);

  equal(calledOnGet, true);
  equal(calledOnRequest, false);
  equal(responseData.status, 200);
});

test('user redirect', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [
    {
      onGet: ({ response }) => {
        response.redirect('/redirect', 302);
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 302);
  equal(responseData.headers.get('Location'), '/redirect');
});

test('page redirect, add trailingSlash', async () => {
  const requestCtx = mockRequestContext({ url: '/somepage?qs=' });
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [];
  const trailingSlash = true;

  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules, trailingSlash);
  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 308);
  equal(responseData.headers.get('Location'), '/somepage/?qs=');
});

test('page redirect, remove trailingSlash', async () => {
  const requestCtx = mockRequestContext({ url: '/somepage/' });
  const { responseData } = requestCtx;
  const endpointModules: EndpointModule[] = [];
  const trailingSlash = false;

  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules, trailingSlash);
  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 308);
  equal(responseData.headers.get('Location'), '/somepage');
});

test('not type page, isEndpointOnly', async () => {
  const requestCtx = mockRequestContext();
  const endpointModules: EndpointModule[] = [];

  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules, false, true);

  equal(userResponse.isEndpointOnly, true);
});

test('not type page, isEndpointOnly=false, accept json header', async () => {
  const requestCtx = mockRequestContext();
  const { request } = requestCtx;
  request.headers.set('Accept', 'application/json');
  const endpointModules: EndpointModule[] = [];

  const userResponse = await loadUserResponse(requestCtx, {}, endpointModules, false, false);

  equal(userResponse.isEndpointOnly, true);
});

test.run();
