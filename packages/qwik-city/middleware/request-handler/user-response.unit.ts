import { test } from 'uvu';
import { equal, instance } from 'uvu/assert';
import { mockRequestContext, wait } from './test-utils';
import type { PageModule, RouteModule } from '../../runtime/src/types';
import { getRouteMatchPathname, isEndPointRequest, loadUserResponse } from './user-response';
import { RedirectResponse } from './redirect-handler';
import { ErrorResponse } from './error-handler';

test('do not add Vary response header for GET if its already added', async () => {
  const requestCtx = mockRequestContext({
    method: 'GET',
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onRequest: ({ response }) => {
        response.headers.set('Vary', 'X-CUSTOM');
      },
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagehtml');
  equal(u.headers.get('Vary'), 'X-CUSTOM');
});

test('add Vary response header for GET w/ default export and onRequest for html', async () => {
  const requestCtx = mockRequestContext({
    method: 'GET',
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onRequest: () => {},
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagehtml');
  equal(u.headers.get('Vary'), 'Content-Type, Accept');
});

test('add Vary response header for GET w/ default export and onGet for html', async () => {
  const requestCtx = mockRequestContext({
    method: 'GET',
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onGet: () => {},
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagehtml');
  equal(u.headers.get('Vary'), 'Content-Type, Accept');
});

test('add Vary response header for GET w/ default export and onGet for application/json request', async () => {
  const requestCtx = mockRequestContext({
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onGet: () => {},
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'endpoint');
  equal(u.headers.get('Vary'), 'Content-Type, Accept');
});

test('endpoint type cuz non-get method, and method handler, and with default module export', async () => {
  const requestCtx = mockRequestContext({
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onPost: () => {},
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'endpoint');
});

test('endpoint type cuz no default module export', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;

  const endpoints: RouteModule[] = [
    {
      onGet: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'endpoint');
  equal(u.headers.get('Vary'), null);
});

test('no redirect for q-data.json when trailing slash required', async () => {
  try {
    const requestCtx = mockRequestContext({
      url: '/q-data.json',
    });
    const trailingSlash = true;

    const endpoints: PageModule[] = [
      {
        default: () => {},
      },
    ];

    const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
    equal(u.type, 'pagedata');
  } catch (e) {
    equal(e, 'Shouldnt have thrown');
  }
});

test('pagedata type cuz q-data.json w/ onGet', async () => {
  const requestCtx = mockRequestContext({
    url: '/foo/q-data.json',
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onGet: () => {},
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagedata');
});

test('pagedata type cuz q-data.json request w/ accept json', async () => {
  const requestCtx = mockRequestContext({
    url: '/foo/q-data.json',
  });
  requestCtx.request.headers.set('Accept', 'application/json');
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagedata');
});

test('pagedata type cuz q-data.json request', async () => {
  const requestCtx = mockRequestContext({
    url: '/foo/q-data.json',
  });
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagedata');
});

test('endpoint type cuz default module export and application/jon accept header', async () => {
  const requestCtx = mockRequestContext();
  requestCtx.request.headers.set('Accept', 'application/json');
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      onGet: () => {},
      default: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'endpoint');
});

test('pagehtml type cuz default module export', async () => {
  const requestCtx = mockRequestContext();
  const trailingSlash = false;

  const endpoints: PageModule[] = [
    {
      default: () => {},
      onGet: () => {},
    },
  ];

  const u = await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
  equal(u.type, 'pagehtml');
});

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
          response.status = 302;
          response.headers.set('Location', '/redirect');
        },
        default: () => {},
      },
    ];

    await loadUserResponse(requestCtx, {}, endpoints, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, RedirectResponse);
    equal(e.status, 302);
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
    equal(e.status, 302);
    equal(e.headers.get('Location'), '/redirect');
  }
});

test('no handler for endpoint w/out onPost', async () => {
  try {
    const requestCtx = mockRequestContext({
      method: 'POST',
    });
    const trailingSlash = false;
    const routeModules: (RouteModule | PageModule)[] = [
      { onDelete: () => {} },
      { onGet: () => {} },
    ];
    await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, ErrorResponse);
    equal(e.status, 405);
  }
});

test('no handler for endpoint w/out onGet', async () => {
  try {
    const requestCtx = mockRequestContext({
      method: 'GET',
    });
    const trailingSlash = false;
    const routeModules: (RouteModule | PageModule)[] = [
      { onDelete: () => {} },
      { onPost: () => {} },
    ];
    await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
    equal(true, false, 'Should have thrown');
  } catch (e: any) {
    instance(e, ErrorResponse);
    equal(e.status, 405);
  }
});

test('handle POST w/ default export', async () => {
  const requestCtx = mockRequestContext({
    method: 'POST',
  });
  const trailingSlash = false;
  const routeModules: (RouteModule | PageModule)[] = [
    {
      default: () => {},
    },
  ];
  const u = await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
  equal(u.type, 'pagehtml');
  equal(u.status, 200);
});

test('handle GET w/ default export', async () => {
  const requestCtx = mockRequestContext({
    method: 'GET',
  });
  const trailingSlash = false;
  const routeModules: (RouteModule | PageModule)[] = [
    {
      default: () => {},
    },
  ];
  const u = await loadUserResponse(requestCtx, {}, routeModules, trailingSlash);
  equal(u.type, 'pagehtml');
  equal(u.status, 200);
  equal(u.headers.get('Vary'), null);
});

test('no handler for non-GET/POST endpoint w/ default export', async () => {
  try {
    const requestCtx = mockRequestContext({
      method: 'PATCH',
    });
    const trailingSlash = false;
    const routeModules: (RouteModule | PageModule)[] = [
      {
        onDelete: () => {},
        default: () => {},
      },
    ];
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
    equal(e.status, 302);
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
    equal(e.status, 302);
    equal(e.location, '/somepath/?qs=true');
  }
});

[
  {
    pathname: '/about/',
    trailingSlash: true,
    expect: '/about/',
  },
  {
    pathname: '/about',
    trailingSlash: false,
    expect: '/about',
  },
  {
    pathname: '/about/q-data.json',
    trailingSlash: true,
    expect: '/about/',
  },
  {
    pathname: '/about/q-data.json',
    trailingSlash: false,
    expect: '/about',
  },
  {
    pathname: '/q-data.json',
    trailingSlash: true,
    expect: '/',
  },
  {
    pathname: '/q-data.json',
    trailingSlash: false,
    expect: '/',
  },
  {
    pathname: '/',
    trailingSlash: false,
    expect: '/',
  },
].forEach((t) => {
  test(`getRouteMatchPathname ${t.pathname}, trailingSlash:${t.trailingSlash}`, () => {
    const pathname = getRouteMatchPathname(t.pathname, t.trailingSlash);
    equal(pathname, t.expect);
  });
});

[
  {
    method: 'PUT',
    acceptHeader: 'text/html',
    expect: true,
  },
  {
    method: 'PUT',
    acceptHeader: null,
    expect: true,
  },
  {
    method: 'HEAD',
    acceptHeader: null,
    expect: true,
  },
  {
    method: 'DELETE',
    acceptHeader: null,
    expect: true,
  },
  {
    method: 'PATCH',
    acceptHeader: null,
    expect: true,
  },
  {
    method: 'POST',
    acceptHeader: null,
    expect: false,
  },
  {
    method: 'POST',
    acceptHeader: 'application/json',
    expect: true,
  },
  {
    method: 'POST',
    acceptHeader: 'application/json,text/html',
    expect: true,
  },
  {
    method: 'POST',
    acceptHeader: 'text/html, application/json',
    expect: false,
  },
  {
    method: 'POST',
    acceptHeader: 'text/html',
    expect: false,
  },
  {
    method: 'GET',
    acceptHeader: 'application/json',
    expect: true,
  },
  {
    method: 'GET',
    acceptHeader: 'application/json,text/html',
    expect: true,
  },
  {
    method: 'GET',
    acceptHeader: 'text/html, application/json',
    expect: false,
  },
  {
    method: 'GET',
    acceptHeader: 'text/html',
    expect: false,
  },
  {
    method: 'GET',
    acceptHeader: '*/*',
    expect: false,
  },
  {
    method: 'GET',
    contentTypeHeader: 'application/json',
    expect: true,
  },
  {
    method: 'GET',
    contentTypeHeader: 'application/json',
    acceptHeader: 'text/html',
    expect: true,
  },
  {
    method: 'GET',
    contentTypeHeader: 'text/html',
    expect: false,
  },
  {
    method: 'GET',
    expect: false,
  },
].forEach((t) => {
  test(`isEndPointRequest ${t.method}, Accept: ${t.acceptHeader}`, () => {
    equal(isEndPointRequest(t.method, t.acceptHeader!, t.contentTypeHeader!), t.expect);
  });
});

test.run();
