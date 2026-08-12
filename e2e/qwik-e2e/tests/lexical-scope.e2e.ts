import { test, expect } from '@playwright/test';

test.describe('lexical-scope', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/lexical-scope');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test('should rerender without changes', async ({ page }) => {
    const SNAPSHOT =
      '<p><!--d=4-->1<!--/d--></p><p><!--d=5-->"&lt;/script&gt;"<!--/d--></p><p><!--d=6-->{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]],"promise":{}}<!--/d--></p><p><!--d=7-->undefined<!--/d--></p><p><!--d=8-->null<!--/d--></p><p><!--d=9-->[1,2,"hola",null,{}]<!--/d--></p><p><!--d=10-->true<!--/d--></p><p><!--d=11-->false<!--/d--></p><p><!--d=12-->()=&gt;console.error()<!--/d--></p><p q:id="13">mutable message</p><p><!--d=14-->{"signal":{"value":0},"signalValue":0,"store":{"count":0,"signal":{"value":0}},"storeCount":0,"storeSignal":{"value":0}}<!--/d--></p><p><!--d=15-->from a promise<!--/d--></p><p><!--d=16-->message, message2, signal, signalValue, store, storeCount, storeSignal<!--/d--></p>';
    const RESULT =
      '[1,"</script>",{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]],"promise":{}},"undefined","null",[1,2,"hola",null,{}],true,false,null,"mutable message",null,{"value":0},0,{"count":0,"signal":{"value":0}},0,{"value":0},"from a promise","http://qwik.builder.com/docs?query=true","2022-07-26T17:40:30.255Z","hola()\\\\/ gi",12,"failed message",["\\b: backspace","\\f: form feed","\\n: line feed","\\r: carriage return","\\t: horizontal tab","\\u000b: vertical tab","\\u0000: null character","\': single quote","\\\\: backslash"],"Infinity","-Infinity","NaN","88","qwik",["1","2"],"200000000000000000","[\\"hola\\",12,{\\"a\\":\\"2022-07-26T17:40:30.255Z\\"}]","[[{},{}],[\\"mapkey\\",\\"http://qwik.builder.com/docs?query=true\\"]]"]';

    function normalizeSnapshot(str: string) {
      return str.replace(' =&gt; ', '=&gt;');
    }
    const result = page.locator('#result');
    const content = page.locator('#static');
    expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
    const btn = page.locator('#rerender');
    await expect(btn).toHaveText('Rerender 0');
    await expect(result).toHaveText('');

    // Click button
    await btn.click();

    await expect(btn).toHaveText('Rerender 1');
    expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
    await expect(result).toHaveText(RESULT);

    // Click button
    await btn.click();

    await expect(btn).toHaveText('Rerender 2');
    expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
    await expect(result).toHaveText(RESULT);
  });
});
