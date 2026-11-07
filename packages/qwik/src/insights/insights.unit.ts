import { expect, test } from 'vitest';
import { insightsGate } from './insights';

test('insightsGate stays tiny (it ships inline on every insights page)', () => {
  const src = (insightsGate as any).resolved.serialized;
  // The heavy tracker lives in the lazily-loaded pinger; the gate only samples + buffers + imports.
  expect(src.length).toBeLessThan(700);
  expect(src).toMatchInlineSnapshot(
    `"()=>((w,d,p)=>{if(Math.random()>=__QI_SAMPLE__){return;}var qRouteEl=d.querySelector(\`[q\\\\:route]\`),base=d.querySelector(\`[q\\\\:base]\`)?.getAttribute(\`q:base\`)||"/build/",queue=[],tracker=w.qSymbolTracker={symbols:[],publicApiKey:__QI_KEY__,q:queue,c:{u:__QI_URL__},t0:p.now()};d.addEventListener(\`qsymbol\`,_event=>{var detail=_event.detail;queue.push({symbol:detail.symbol,reqTime:detail.reqTime,deliveredTime:_event.timeStamp,interaction:!!detail.element,route:qRouteEl?.getAttribute(\`q:route\`)||"/"});tracker.f&&tracker.f();});import(base+"qwik-insights-pinger.js");})(window,document,performance)"`
  );
});
