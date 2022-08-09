import { test } from 'uvu';
import { equal, instance } from 'uvu/assert';
import { mockRequestContext, wait } from './test-utils';
import type { PageModule, RouteModule } from '../../runtime/src/library/types';
import { loadUserResponse } from './user-response';
import { RedirectResponse } from './redirect-handler';
import { ErrorResponse } from './error-handler';

test('sync endpoint, undefined body', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;

  const endpoints: RouteModule[] = [
    {
      onGet: ({ response }) => {
        response.status = 204;
        response.headers.append('name', 'value');
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.status, 204);
  equal(u.headers.get('name'), 'value');
  equal(u.pendingBody, undefined);
  equal(u.resolvedBody, undefined);
});

test('async endpoint, resolved data, render blocking', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;

  const endpoints: RouteModule[] = [
    {
      onGet: async ({ response }) => {
        await wait();
        response.status = 204;
        response.headers.append('name', 'value');
        return { mph: 88 };
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.status, 204);
  equal(u.headers.get('name'), 'value');
  equal(u.pendingBody, undefined);
  equal(u.resolvedBody, { mph: 88 });
});

test('onPost priority over onRequest, dont call onGet', async () => {
  const requestCtx = mockRequestContext({ method: 'POST' });
  const trailingSlash = false;

  let calledOnGet = false;
  let calledOnPost = false;
  let calledOnRequest = false;
  const endpoints: RouteModule[] = [
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

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.status, 200);
  equal(calledOnGet, false);
  equal(calledOnPost, true);
  equal(calledOnRequest, false);
});

test('catchall onRequest', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;

  let calledOnRequest = false;
  const endpoints: RouteModule[] = [
    {
      onRequest: async () => {
        await wait();
        calledOnRequest = true;
      },
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.status, 200);
  equal(calledOnRequest, true);
});

test('user manual redirect, PageModule', async () => {
  try {
    const requestCtx = mockRequestContext();
    const trailingSlash = false;

    const endpoints: PageModule[] = [
      {
        onRequest: async ({ response }) => {
          await wait();
          response.status = 307;
          response.headers.set('Location', '/redirect');
        },
        default: () => {},
      },
    ];

    await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, RedirectResponse);
    equal(e.status, 307);
    equal(e.location, '/redirect');
    equal(e.headers.get('Location'), '/redirect');
  }
});

test('throw redirect', async () => {
  try {
    const requestCtx = mockRequestContext();
    const trailingSlash = false;

    const endpoints: RouteModule[] = [
      {
        onRequest: async ({ response }) => {
          await wait();
          throw response.redirect('/redirect');
        },
      },
    ];

    await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, RedirectResponse);
    equal(e.status, 307);
    equal(e.headers.get('Location'), '/redirect');
  }
});

test('no handler for endpoint', async () => {
  try {
    const requestCtx = mockRequestContext();
    const trailingSlash = false;
    const routeModules: RouteModule[] = [{ onDelete: () => {} }, { onPost: () => {} }, {}];
    await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, ErrorResponse);
    equal(e.status, 405);
  }
});

test('remove trailing slash, PageModule', async () => {
  try {
    const requestCtx = mockRequestContext({ url: '/somepath/?qs=true' });
    const trailingSlash = false;
    const routeModules: PageModule[] = [
      {
        default: () => {},
      },
    ];
    await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, RedirectResponse);
    equal(e.status, 308);
    equal(e.location, '/somepath?qs=true');
  }
});

test('add trailing slash, PageModule', async () => {
  try {
    const requestCtx = mockRequestContext({ url: '/somepath?qs=true' });
    const trailingSlash = true;
    const routeModules: PageModule[] = [
      {
        default: () => {},
      },
    ];
    await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, RedirectResponse);
    equal(e.status, 308);
    equal(e.location, '/somepath/?qs=true');
  }
});

test.run();
