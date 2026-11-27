import { describe, expect, test } from 'vitest';
import { getRouterChunkName } from './router-chunk';

const INSTALLED = '/app/node_modules/@qwik.dev/router/lib';

describe('getRouterChunkName', () => {
  test("puts the router's runtime in one chunk: index.qwik.mjs, chunks/head.qwik.mjs and @qwik-router-config all give 'qwik-router'", () => {
    expect([
      getRouterChunkName(`${INSTALLED}/index.qwik.mjs`),
      getRouterChunkName(`${INSTALLED}/chunks/head.qwik.mjs`),
      getRouterChunkName('@qwik-router-config'),
    ]).toEqual(['qwik-router', 'qwik-router', 'qwik-router']);
  });

  test("puts the router's QRL segments in that chunk: the <Link>'s click handler and goto give 'qwik-router'", () => {
    expect([
      getRouterChunkName(`${INSTALLED}/index.qwik.mjs_Link_component_handlePreload_AAemwtuBjsE.js`),
      getRouterChunkName(`${INSTALLED}/index.qwik.mjs_useQwikRouter_goto_8j8Vrz2yUIM.js`),
    ]).toEqual(['qwik-router', 'qwik-router']);
  });

  test("finds the router in this repo's own checkout: packages/qwik-router/lib/index.qwik.mjs gives 'qwik-router'", () => {
    expect(getRouterChunkName('/repo/packages/qwik-router/lib/index.qwik.mjs')).toBe('qwik-router');
  });

  test('finds the router on Windows: a path with backslashes gives the same chunk', () => {
    expect(
      getRouterChunkName('C:\\app\\node_modules\\@qwik.dev\\router\\lib\\chunks\\head.qwik.mjs')
    ).toBe('qwik-router');
  });

  test('leaves server$ out, since it brings the serializer: the serverQrl segment gives no chunk', () => {
    expect(getRouterChunkName(`${INSTALLED}/index.qwik.mjs_serverQrl_w03grD0Ag68.js`)).toBeNull();
  });

  test('leaves the mock router out, a test helper: its provider and its goto give no chunk', () => {
    expect([
      getRouterChunkName(
        `${INSTALLED}/index.qwik.mjs_QwikRouterMockProvider_component_WmYC5H00wtI.js`
      ),
      getRouterChunkName(`${INSTALLED}/index.qwik.mjs_useQwikMockRouter_goto_BUbtvTyvVRE.js`),
    ]).toEqual([null, null]);
  });

  test("leaves the app's own modules out: src/routes/index.tsx gives no chunk", () => {
    expect(getRouterChunkName('/app/src/routes/index.tsx')).toBeNull();
  });

  test("leaves the router's server code out: lib/middleware/request-handler/index.mjs gives no chunk", () => {
    expect(getRouterChunkName(`${INSTALLED}/middleware/request-handler/index.mjs`)).toBeNull();
  });
});
