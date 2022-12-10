import type { RouteModule } from '../../runtime/src/types';
import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { mockRequestContext, wait } from './test-utils';
import { loadUserResponse } from './user-response';
import { endpointHandler } from './endpoint-handler';

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
