import { test, expect } from '@playwright/test';

test.describe('lexical-scope', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/lexical-scope');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should rerender without changes', async ({ page }) => {
    const SNAPSHOT =
      '<p>1</p><p>"&lt;/script&gt;"</p><p>{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]],"promise":{}}</p><p>undefined</p><p>null</p><p>[1,2,"hola",null,{}]</p><p>true</p><p>false</p><p>()=&gt;console.error()</p><p><!--t=2-->mutable message<!----></p><p>{"signal":{"value":0},"signalValue":0,"store":{"count":0,"signal":{"value":0}},"storeCount":0,"storeSignal":{"value":0}}</p><p>from a promise</p><p>message, message2, signal, signalValue, store, storeCount, storeSignal</p>';
    const RESULT =
      '[1,"</script>",{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]],"promise":{}},"undefined","null",[1,2,"hola",null,{}],true,false,null,"mutable message",null,{"value":0},0,{"count":0,"signal":{"value":0}},0,{"value":0},"from a promise","http://qwik.builder.com/docs?query=true","2022-07-26T17:40:30.255Z","hola()\\\\/ gi",12,"failed message",["\\b: backspace","\\f: form feed","\\n: line feed","\\r: carriage return","\\t: horizontal tab","\\u000b: vertical tab","\\u0000: null character","\': single quote","\\\\: backslash"],"Infinity","-Infinity","NaN"]';

    function normalizeSnapshot(str: string) {
      return str.replace(' =&gt; ', '=&gt;');
    }
    const result = page.locator('#result');
    const content = page.locator('#static');
    expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
    const btn = page.locator('#rerender');
    expect(await btn.textContent()).toEqual('Rerender 0');
    expect(await result.textContent()).toEqual('');

    // Click button
    await btn.click();
    await page.waitForTimeout(100);

    expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
    expect(await btn.textContent()).toEqual('Rerender 1');
    expect(await result.textContent()).toEqual(RESULT);

    // Click button
    await btn.click();
    await page.waitForTimeout(100);

    expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
    expect(await btn.textContent()).toEqual('Rerender 2');
    expect(await result.textContent()).toEqual(RESULT);
  });
});
