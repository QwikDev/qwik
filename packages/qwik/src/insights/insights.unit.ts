import { expect, test } from 'vitest';
import { insightsPing } from './insights';
import compress from 'brotli/compress.js';

test('insightsPing size', () => {
  const pingSrc = (insightsPing as any).resolved.serialized;
  const compressed = compress(Buffer.from(pingSrc), { mode: 1, quality: 11 });

  expect(compressed.length).toBe(792);
  expect(pingSrc.length).toBe(2099);
  // Just to a sanity check
  expect(pingSrc).toMatchInlineSnapshot(
    `"()=>((w,d,l,n,p,r,S)=>{var publicApiKey=__QI_KEY__,postUrl=__QI_URL__,qVersion=d.querySelector(\`[q\\\\:version]\`)?.getAttribute(\`q:version\`)||"unknown",manifestHash=d.querySelector(\`[q\\\\:manifest-hash]\`)?.getAttribute(\`q:manifest-hash\`)||"dev",qSymbols=[],existingSymbols=new Set,flushSymbolIndex=0,lastReqTime=0,timeoutID,qRouteChangeTime=p.now(),qRouteEl=d.querySelector(\`[q\\\\:route]\`),flush=()=>{timeoutID=undefined;if(qSymbols.length>flushSymbolIndex){var payload={qVersion,publicApiKey,manifestHash,previousSymbol:flushSymbolIndex==0?undefined:qSymbols[flushSymbolIndex-1].symbol,symbols:qSymbols.slice(flushSymbolIndex)};n.sendBeacon(postUrl,S(payload));flushSymbolIndex=qSymbols.length;}},debounceFlush=()=>{timeoutID!=undefined&&clearTimeout(timeoutID);timeoutID=setTimeout(flush,1e3);};w.qSymbolTracker={symbols:qSymbols,publicApiKey};if(qRouteEl){new MutationObserver(mutations=>{var mutation=mutations.find(m=>m.attributeName===\`q:route\`);if(mutation){qRouteChangeTime=p.now();}}).observe(qRouteEl,{attributes:true});}d.addEventListener("visibilitychange",()=>d.visibilityState==="hidden"&&flush());d.addEventListener(\`qsymbol\`,_event=>{var event=_event,detail=event.detail,symbolRequestTime=detail.reqTime,symbolDeliveredTime=event.timeStamp,symbol=detail.symbol;if(!existingSymbols.has(symbol)){existingSymbols.add(symbol);var route=qRouteEl?.getAttribute(\`q:route\`)||"/";qSymbols.push({symbol,route,delay:r(0-lastReqTime+symbolRequestTime),latency:r(symbolDeliveredTime-symbolRequestTime),timeline:r(0-qRouteChangeTime+symbolRequestTime),interaction:!!detail.element});lastReqTime=symbolDeliveredTime;debounceFlush();}});w.addEventListener("error",event=>{var error=event.error;if(!(error&&typeof error==="object")){return;}var payload={url:\`\${l}\`,manifestHash,timestamp:new Date().getTime(),source:event.filename,line:event.lineno,column:event.colno,message:event.message,error:"message"in error?error.message:\`\${error}\`,stack:"stack"in error?error.stack||"":""};n.sendBeacon(\`\${postUrl}error/\`,S(payload));});})(window,document,location,navigator,performance,Math.round,JSON.stringify)"`
  );
});
