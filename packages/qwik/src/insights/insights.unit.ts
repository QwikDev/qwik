import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { insightsGate } from './insights';

test('insightsGate stays tiny (it ships inline on every insights page)', () => {
  const src = (insightsGate as any).resolved.serialized;
  // The heavy tracker lives in the lazily-loaded pinger; the gate only samples + buffers + imports.
  expect(src.length).toBeLessThan(700);
  expect(src).toMatchInlineSnapshot(
    `"()=>((w,d,p)=>{var roll;try{roll=+w.sessionStorage.qInsights||(w.sessionStorage.qInsights=Math.random());}catch(e){roll=Math.random();}if(roll>=__QI_SAMPLE__){return;}var qRouteEl=d.querySelector(\`[q\\\\:route]\`),base=d.querySelector(\`[q\\\\:base]\`)?.getAttribute(\`q:base\`)||"/build/",queue=[],tracker=w.qSymbolTracker={symbols:[],publicApiKey:__QI_KEY__,q:queue,c:{u:__QI_URL__},t0:p.now()};d.addEventListener(\`qsymbol\`,_event=>{var detail=_event.detail;queue.push({symbol:detail.symbol,reqTime:detail.reqTime,deliveredTime:_event.timeStamp,interaction:!!detail.element,route:qRouteEl?.getAttribute(\`q:route\`)||"/"});tracker.f&&tracker.f();});import(base+__QI_PINGER__);})(window,document,performance)"`
  );
});

/** Run the serialized gate like a page load would; resolves to whether it sampled the session. */
function loadPage(sessionStorage: Record<string, unknown>, random: number, sampleRate = 0.05) {
  const page: any = {
    sessionStorage,
    document: { querySelector: () => null, addEventListener() {} },
    performance: { now: () => 0 },
    Math: { ...Math, random: () => random },
    __QI_SAMPLE__: sampleRate,
    __QI_KEY__: 'key12345',
    __QI_URL__: '/collect/',
    __QI_PINGER__: 'qwik-insights-pinger-test.js',
  };
  page.window = page;
  const gate = (insightsGate as any).resolved.serialized.replace(/import\(/, 'void(');
  runInNewContext(`(${gate})()`, page);
  return !!page.qSymbolTracker;
}

test('insightsGate samples once per session, not per page load', () => {
  const session: Record<string, unknown> = {};
  expect(loadPage(session, 0.01)).toBe(true);
  // A later full page load in the same session keeps the first roll.
  expect(loadPage(session, 0.99)).toBe(true);

  const otherSession: Record<string, unknown> = {};
  expect(loadPage(otherSession, 0.99)).toBe(false);
  expect(loadPage(otherSession, 0.01)).toBe(false);
});

test('insightsGate still samples when sessionStorage throws', () => {
  const blocked = new Proxy(
    {},
    {
      get: () => {
        throw new Error('denied');
      },
    }
  );
  expect(loadPage(blocked as any, 0.01)).toBe(true);
  expect(loadPage(blocked as any, 0.99)).toBe(false);
});
