import type { RouteModule } from '../../runtime/src/library/types';
import { test } from 'uvu';
import { equal, instance } from 'uvu/assert';
import { mockRequestContext, wait } from './test-utils';
import { loadUserResponse } from './user-response';
import { endpointHandler } from './endpoint-handler';

test('onRequest, async return callback, async callback data', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const routeModules: RouteModule[] = [
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
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
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
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
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
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
    {
      onRequest: ({ response }) => {
        response.status = 204;
        return () => {
          return 88;
        };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
    {
      onRequest: () => {
        return 88;
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
    {
      onRequest: async () => {
        await wait();
        return 'mph';
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
    {
      onRequest: () => {
        return 'mph';
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
    {
      onRequest: async () => {
        await wait();
        return { mph: 88 };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
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
  const routeModules: RouteModule[] = [
    {
      onRequest: () => {
        return { mph: 88 };
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, { mph: 88 });

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'application/json; charset=utf-8');
  equal(await responseData.body, `{"mph":88}`);
});

test('onRequest, user manually set content-type', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  const routeModules: RouteModule[] = [
    {
      onRequest: ({ response }) => {
        response.headers.set('Content-Type', 'text/plain');
        return 88;
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
  equal(userResponse.pendingBody, undefined);
  equal(userResponse.resolvedBody, 88);

  await endpointHandler(requestCtx, userResponse);

  equal(responseData.status, 200);
  equal(responseData.headers.get('Content-Type'), 'text/plain');
  equal(await responseData.body, `88`);
});

test('onGet preference over onRequest', async () => {
  const requestCtx = mockRequestContext();
  const { responseData } = requestCtx;
  let calledOnGet = false;
  let calledOnRequest = false;
  const routeModules: RouteModule[] = [
    {
      onGet: () => {
        calledOnGet = true;
      },
      onRequest: () => {
        calledOnRequest = true;
      },
    },
  ];
  const userResponse = await loadUserResponse(requestCtx, {}, routeModules);
  await endpointHandler(requestCtx, userResponse);

  equal(calledOnGet, true);
  equal(calledOnRequest, false);
  equal(responseData.status, 200);
});

test.run();
