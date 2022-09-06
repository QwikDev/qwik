import { test, expect } from '@playwright/test';

test.describe('e2e', () => {
  test.describe('two-listeners', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/two-listeners');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should support two QRLs on event', async ({ page }) => {
      const button = page.locator('.two-listeners');
      await button.click();
      await expect(button).toContainText('2 / 2');
    });
  });

  test.describe('lexical-scope', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/lexical-scope');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should rerender without changes', async ({ page }) => {
      const SNAPSHOT =
        '<p>1</p><p>"&lt;/script&gt;"</p><p>{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]],"promise":{}}</p><p>undefined</p><p>null</p><p>[1,2,"hola",null,{}]</p><p>true</p><p>false</p><p>()=&gt;console.error()</p><p>mutable message</p><p>from a promise</p>';
      const RESULT =
        '[1,"</script>",{"a":{"thing":12},"b":"hola","c":123,"d":false,"e":true,"f":null,"h":[1,"string",false,{"hola":1},["hello"]],"promise":{}},"undefined","null",[1,2,"hola",null,{}],true,false,null,"mutable message","from a promise","http://qwik.builder.com/docs?query=true","2022-07-26T17:40:30.255Z","hola()\\\\/ gi",12,"failed message",["\\b: backspace","\\f: form feed","\\n: line feed","\\r: carriage return","\\t: horizontal tab","\\u000b: vertical tab","\\u0000: null character","\': single quote","\\\\: backslash"]]';

      function normalizeSnapshot(str: string) {
        return str.replace(' =&gt; ', '=&gt;');
      }
      const result = await page.locator('#result');
      const content = await page.locator('#static');
      expect(normalizeSnapshot(await content.innerHTML())).toEqual(SNAPSHOT);
      const btn = await page.locator('#rerender');
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

  test.describe('events', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/events');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should rerender correctly', async ({ page }) => {
      const btnWrapped = await page.locator('#btn-wrapped');
      const btnTransparent = await page.locator('#btn-transparent');

      const contentTransparent = await page.locator('#count-transparent');
      const countWrapped = await page.locator('#count-wrapped');

      expect(await contentTransparent.textContent()).toEqual('countTransparent: 0');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 0');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 0');

      // Click wrapped
      await btnWrapped.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 0');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 1');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 1');

      // Click wrapped
      await btnWrapped.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 0');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 2');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 2');

      // Click transparent
      await btnTransparent.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 1');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 2');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 2');

      // Click transparent
      await btnTransparent.click();
      await page.waitForTimeout(100);
      expect(await contentTransparent.textContent()).toEqual('countTransparent: 2');
      expect(await countWrapped.textContent()).toEqual('countWrapped: 2');
      expect(await btnWrapped.textContent()).toEqual('Wrapped 2');
    });
  });

  test.describe('slot', () => {
    function tests() {
      test('should update count', async ({ page }) => {
        const content1 = await page.locator('#btn1');
        const content2 = await page.locator('#btn2');
        const content3 = await page.locator('#btn3');
        const btnCount = await page.locator('#btn-count');

        await expect(content1).toHaveText('DEFAULT 0');
        await expect(content2).toHaveText('START 0');
        await expect(content3).toHaveText('INSIDE THING 0');

        // Count
        await btnCount.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 1');
        await expect(content2).toHaveText('START 1');
        await expect(content3).toHaveText('INSIDE THING 1');

        // Count
        await btnCount.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 2');
        await expect(content2).toHaveText('START 2');
        await expect(content3).toHaveText('INSIDE THING 2');
      });

      test('should toggle buttons', async ({ page }) => {
        const content1 = await page.locator('#btn1');
        const content2 = await page.locator('#btn2');
        const content3 = await page.locator('#btn3');

        const btnToggleButtons = await page.locator('#btn-toggle-buttons');

        // btnToggleButtons
        await page.waitForTimeout(100);
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('', { useInnerText: true });
        await expect(content2).toHaveText('START 0', { useInnerText: true });
        await expect(content3).toHaveText('', { useInnerText: true });

        // btnToggleButtons
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 0', { useInnerText: true });
        await expect(content2).toHaveText('START 0', { useInnerText: true });
        await expect(content3).toHaveText('INSIDE THING 0', { useInnerText: true });
      });

      test('should toggle buttons with count', async ({ page }) => {
        const content1 = await page.locator('#btn1');
        const content2 = await page.locator('#btn2');
        const content3 = await page.locator('#btn3');

        const btnToggleButtons = await page.locator('#btn-toggle-buttons');
        const btnCount = await page.locator('#btn-count');

        // btnToggleButtons
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('', { useInnerText: true });
        await expect(content2).toHaveText('START 0', { useInnerText: true });
        await expect(content3).toHaveText('', { useInnerText: true });

        // btnToggleButtons
        await btnCount.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('', { useInnerText: true });
        await expect(content2).toHaveText('START 1', { useInnerText: true });
        await expect(content3).toHaveText('', { useInnerText: true });

        // btnToggleButtons
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 1', { useInnerText: true });
        await expect(content2).toHaveText('START 1', { useInnerText: true });
        await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });

        // btnToggleButtons
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('', { useInnerText: true });
        await expect(content2).toHaveText('START 1', { useInnerText: true });
        await expect(content3).toHaveText('', { useInnerText: true });

        // btnToggleButtons
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 1', { useInnerText: true });
        await expect(content2).toHaveText('START 1', { useInnerText: true });
        await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });
      });

      test('should toggle content', async ({ page }) => {
        const content1 = await page.locator('#btn1');
        const content2 = await page.locator('#btn2');
        const content3 = await page.locator('#btn3');

        const btnToggleContent = await page.locator('#btn-toggle-content');
        const btnCount = await page.locator('#btn-count');

        // btnToggleButtons
        await btnToggleContent.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('', { useInnerText: true });
        await expect(content2).toHaveText('', { useInnerText: true });
        await expect(content3).toHaveText('', { useInnerText: true });

        // btnToggleButtons
        await btnCount.click();
        await btnToggleContent.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 1', { useInnerText: true });
        await expect(content2).toHaveText('START 1', { useInnerText: true });
        await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });
      });

      test('should toggle content and buttons', async ({ page }) => {
        const content1 = await page.locator('#btn1');
        const content2 = await page.locator('#btn2');
        const content3 = await page.locator('#btn3');

        const btnToggleButtons = await page.locator('#btn-toggle-buttons');
        const btnToggleContent = await page.locator('#btn-toggle-content');

        // btnToggleButtons
        await btnToggleButtons.click();
        await page.waitForTimeout(100);
        await btnToggleContent.click();
        await page.waitForTimeout(100);
        await btnToggleButtons.click();

        await expect(content1).toHaveText('', { useInnerText: true });
        await expect(content2).toHaveText('', { useInnerText: true });
        await expect(content3).toHaveText('', { useInnerText: true });
      });

      test('should toggle thing + count', async ({ page }) => {
        const content1 = await page.locator('#btn1');
        const content2 = await page.locator('#btn2');
        const content3 = await page.locator('#btn3');

        const btnToggleThing = await page.locator('#btn-toggle-thing');
        const btnCount = await page.locator('#btn-count');

        // btnToggleButtons
        await btnToggleThing.click();
        await btnCount.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 1');
        await expect(content2).toHaveText('START 1');
        await expect(content3).toHaveText('');

        await btnToggleThing.click();
        await page.waitForTimeout(100);
        await expect(content1).toHaveText('DEFAULT 1');
        await expect(content2).toHaveText('START 1');
        await expect(content3).toHaveText('INSIDE THING 1');
      });

      test('should not lose q context', async ({ page }) => {
        const content3 = await page.locator('#btn3');
        const projected = await page.locator('#projected');
        const btnToggleThing = await page.locator('#btn-toggle-thing');
        const btnCount = await page.locator('#btn-count');

        await btnCount.click();
        await page.waitForTimeout(100);
        await expect(content3).toHaveText('INSIDE THING 1', { useInnerText: true });

        // btnToggleButtons
        await btnToggleThing.click();
        await page.waitForTimeout(100);
        await btnToggleThing.click();
        await page.waitForTimeout(100);

        // Click projected
        await projected.click();
        await page.waitForTimeout(100);

        await expect(content3).toHaveText('INSIDE THING 0', { useInnerText: true });
      });
    }

    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/slot');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    tests();

    test.describe('client rerender', () => {
      test.beforeEach(async ({ page }) => {
        const toggleRender = await page.locator('#btn-toggle-render');
        await toggleRender.click();
        await page.waitForTimeout(100);
        await toggleRender.click();
        await page.waitForTimeout(100);
      });
      tests();
    });
  });

  test.describe('factory', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/factory');
    });

    test('should render correctly', async ({ page }) => {
      const body = await page.locator('body');

      expect((await body.innerText()).trim()).toEqual('A\nB\nLight: wow!');
    });
  });

  test.describe('watch', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/watch');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should watch correctly', async ({ page }) => {
      const server = await page.locator('#server-content');

      const parent = await page.locator('#parent');
      const child = await page.locator('#child');
      const debounced = await page.locator('#debounced');
      const addButton = page.locator('#add');

      await expect(server).toHaveText('comes from server');
      await expect(parent).toHaveText('2');
      await expect(child).toHaveText('2 / 4');
      await expect(debounced).toHaveText('Debounced: 0');

      await addButton.click();
      await page.waitForTimeout(100);

      await expect(server).toHaveText('comes from server');
      await expect(parent).toHaveText('3');
      await expect(child).toHaveText('3 / 6');
      await expect(debounced).toHaveText('Debounced: 0');

      await addButton.click();
      await page.waitForTimeout(100);

      await expect(server).toHaveText('comes from server');
      await expect(parent).toHaveText('4');
      await expect(child).toHaveText('4 / 8');
      await expect(debounced).toHaveText('Debounced: 0');

      // Wait for debouncer
      await page.waitForTimeout(2000);
      await expect(server).toHaveText('comes from server');
      await expect(parent).toHaveText('4');
      await expect(child).toHaveText('4 / 8');
      await expect(debounced).toHaveText('Debounced: 8');
    });
  });

  test.describe('context', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/context');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const level2State1 = await page.locator('.level2-state1');
      const level2State2 = await page.locator('.level2-state2');
      const level2SSlot = await page.locator('.level2-slot');

      const btnRootIncrement1 = await page.locator('.root-increment1');
      const btnRootIncrement2 = await page.locator('.root-increment2');
      const btnLevel2Increment = await page.locator('.level2-increment3').nth(0);
      const btnLevel2Increment2 = await page.locator('.level2-increment3').nth(1);

      expect(await level2State1.allTextContents()).toEqual([
        'ROOT / state1 = 0',
        'ROOT / state1 = 0',
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        'ROOT / state2 = 0',
        'ROOT / state2 = 0',
      ]);
      expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);

      await btnRootIncrement1.click();
      await page.waitForTimeout(100);

      expect(await level2State1.allTextContents()).toEqual([
        'ROOT / state1 = 1',
        'ROOT / state1 = 1',
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        'ROOT / state2 = 0',
        'ROOT / state2 = 0',
      ]);
      expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);
      await btnRootIncrement2.click();
      await page.waitForTimeout(100);

      expect(await level2State1.allTextContents()).toEqual([
        'ROOT / state1 = 1',
        'ROOT / state1 = 1',
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        'ROOT / state2 = 1',
        'ROOT / state2 = 1',
      ]);
      expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);
      await btnLevel2Increment.click();
      await btnLevel2Increment.click();
      await btnLevel2Increment2.click();
      await page.waitForTimeout(100);

      const level3State1 = await page.locator('.level3-state1');
      const level3State2 = await page.locator('.level3-state2');
      const level3State3 = await page.locator('.level3-state3');
      const level3Slot = await page.locator('.level3-slot');

      expect(await level2State1.allTextContents()).toEqual([
        'ROOT / state1 = 1',
        'ROOT / state1 = 1',
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        'ROOT / state2 = 1',
        'ROOT / state2 = 1',
      ]);
      expect(await level2SSlot.allTextContents()).toEqual(['bar = 0', 'bar = 0']);

      expect(await level3State1.allTextContents()).toEqual([
        'Level2 / state1 = 0',
        'Level2 / state1 = 0',
        'Level2 / state1 = 0',
      ]);
      expect(await level3State2.allTextContents()).toEqual([
        'ROOT / state2 = 1',
        'ROOT / state2 = 1',
        'ROOT / state2 = 1',
      ]);
      expect(await level3State3.allTextContents()).toEqual([
        'Level2 / state3 = 2',
        'Level2 / state3 = 2',
        'Level2 / state3 = 1',
      ]);
      expect(await level3Slot.allTextContents()).toEqual(['bar = 0', 'bar = 0', 'bar = 0']);
    });
  });

  test.describe('effect-client', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/effect-client');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const counter = await page.locator('#counter');
      const msg = await page.locator('#msg');
      const msgEager = await page.locator('#eager-msg');
      const msgClientSide1 = await page.locator('#client-side-msg-1');
      const msgClientSide2 = await page.locator('#client-side-msg-2');

      await expect(counter).toHaveText('0');
      await expect(msg).toHaveText('empty');
      await expect(msgEager).toHaveText('run');
      await expect(msgClientSide1).toHaveText('run');
      await expect(msgClientSide2).toHaveText('run');

      await counter.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);

      await expect(counter).toHaveText('10');
      await expect(msg).toHaveText('run');

      await page.waitForTimeout(500);
      await expect(counter).toHaveText('11');
      await expect(msg).toHaveText('run');
    });
  });

  test.describe('toggle', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/toggle');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const title = await page.locator('h1');
      const mount = await page.locator('#mount');
      const root = await page.locator('#root');
      const logs = await page.locator('#logs');
      const btnToggle = await page.locator('button#toggle');
      const btnIncrement = await page.locator('button#increment');

      let logsStr = 'Logs: Log(0)';
      await expect(title).toHaveText('ToggleA');
      await expect(mount).toHaveText('mounted in server');
      await expect(root).toHaveText('hello from root (0/0)');
      await expect(logs).toHaveText(logsStr);

      // ToggleA
      await btnToggle.click();
      logsStr += 'Child(0)Child(0)ToggleA()';

      await expect(title).toHaveText('ToggleB');
      await expect(mount).toHaveText('mounted in client');
      await expect(root).toHaveText('hello from root (0/0)');
      await expect(logs).toHaveText(logsStr);

      // Increment
      await btnIncrement.click();
      logsStr += 'Log(1)Child(1)';

      await expect(title).toHaveText('ToggleB');
      await expect(mount).toHaveText('mounted in client');
      await expect(root).toHaveText('hello from root (1/1)');
      await expect(logs).toHaveText(logsStr);

      // ToggleB
      await btnToggle.click();
      logsStr += 'Child(1)ToggleB()';

      await expect(title).toHaveText('ToggleA');
      await expect(mount).toHaveText('mounted in client');
      await expect(root).toHaveText('hello from root (1/1)');
      await expect(logs).toHaveText(logsStr);

      // Increment
      await btnIncrement.click();
      logsStr += 'Log(2)Child(2)';

      await expect(title).toHaveText('ToggleA');
      await expect(mount).toHaveText('mounted in client');
      await expect(root).toHaveText('hello from root (2/2)');
      await expect(logs).toHaveText(logsStr);

      // ToggleA + increment
      await btnToggle.click();
      await btnIncrement.click();
      logsStr += 'Child(2)ToggleA()Log(3)Child(3)';

      await expect(title).toHaveText('ToggleB');
      await expect(mount).toHaveText('mounted in client');
      await expect(root).toHaveText('hello from root (3/3)');
      await expect(logs).toHaveText(logsStr);
    });
  });

  test.describe('render', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/render');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const button = await page.locator('button#increment');
      const text = await page.locator('span');

      await expect(text).toHaveText('Rerender 0');
      await button.click();
      await expect(text).toHaveText('Rerender 1');
    });

    test('should render classes', async ({ page }) => {
      const increment = await page.locator('button#increment');
      const toggle = await page.locator('button#toggle');

      const attributes = await page.locator('#attributes');

      await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1 even stable0');
      await expect(attributes).toHaveAttribute('aria-hidden', 'true');
      await expect(attributes).toHaveAttribute('preventdefault:click', '');

      await increment.click();

      await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1 stable0 odd');
      await expect(attributes).toHaveAttribute('aria-hidden', 'true');
      await expect(attributes).toHaveAttribute('preventdefault:click', '');

      await toggle.click();

      await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1');
      await expect(attributes).toHaveAttribute('aria-hidden', '');
      await expect(attributes).toHaveAttribute('preventdefault:click', '');

      await increment.click();

      await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1');
      await expect(attributes).toHaveAttribute('aria-hidden', '');
      await expect(attributes).toHaveAttribute('preventdefault:click', '');

      await toggle.click();

      await expect(attributes).toHaveAttribute('class', '⭐️unvb18-1 even stable0');
      await expect(attributes).toHaveAttribute('aria-hidden', 'true');
      await expect(attributes).toHaveAttribute('preventdefault:click', '');
    });
  });

  test.describe('resource', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/resource');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const resource1 = await page.locator('.resource1');
      const logs = await page.locator('.logs');
      const increment = await page.locator('button.increment');
      let logsContent =
        '[RENDER] <ResourceApp>\n[WATCH] 1 before\n[WATCH] 1 after\n[WATCH] 2 before\n[WATCH] 2 after\n[RESOURCE] 1 before\n[RENDER] <Results>\n\n\n';
      await expect(resource1).toHaveText('resource 1 is 80');
      // await expect(resource2).toHaveText('resource 2 is 160');
      await expect(logs).toHaveText(logsContent);

      // Increment
      await increment.click();
      await page.waitForTimeout(400);

      logsContent +=
        '[RESOURCE] 1 after\n\n[WATCH] 1 before\n[WATCH] 1 after\n[WATCH] 2 before\n[WATCH] 2 after\n[RESOURCE] 1 before\n[RENDER] <Results>\n\n\n';
      await expect(resource1).toHaveText('loading resource 1...');
      // await expect(resource2).toHaveText('loading resource 2...');
      await expect(logs).toHaveText(logsContent);

      // Wait until finish loading
      await page.waitForTimeout(1000);

      logsContent += '[RESOURCE] 1 after\n[RENDER] <Results>\n\n\n';
      await expect(resource1).toHaveText('resource 1 is 88');
      // await expect(resource2).toHaveText('resource 2 is 176');
      await expect(logs).toHaveText(logsContent);
    });

    test('should track subscriptions', async ({ page }) => {
      const resource1 = await page.locator('.resource1');
      const logs = await page.locator('.logs');
      let logsContent =
        '[RENDER] <ResourceApp>\n[WATCH] 1 before\n[WATCH] 1 after\n[WATCH] 2 before\n[WATCH] 2 after\n[RESOURCE] 1 before\n[RENDER] <Results>\n\n\n';
      await expect(resource1).toHaveText('resource 1 is 80');
      await expect(logs).toHaveText(logsContent);

      // Count
      const countBtn = await page.locator('button.count');
      await expect(countBtn).toHaveText('count is 0');
      await countBtn.click();
      await expect(countBtn).toHaveText('count is 1');

      logsContent += '[RESOURCE] 1 after\n[RENDER] <Results>\n\n\n';
      await expect(logs).toHaveText(logsContent);

      await countBtn.click();
      await expect(countBtn).toHaveText('count is 2');

      logsContent += '[RENDER] <Results>\n\n\n';
      await expect(logs).toHaveText(logsContent);
    });
  });

  test.describe('resource serialization', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/resource-serialization');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const button1 = await page.locator('button.r1');
      const button2 = await page.locator('button.r2');
      const button3 = await page.locator('button.r3');

      await expect(button1).toHaveText('PASS: Success 0');
      await expect(button2).toHaveText('ERROR: Error: failed 0');
      await expect(button3).toHaveText('ERROR: timeout 0');

      // Click button 1
      await button1.click();

      await expect(button1).toHaveText('PASS: Success 1');
      await expect(button2).toHaveText('ERROR: Error: failed 0');
      await expect(button3).toHaveText('ERROR: timeout 0');

      // Click button 2
      await button2.click();

      await expect(button1).toHaveText('PASS: Success 1');
      await expect(button2).toHaveText('ERROR: Error: failed 1');
      await expect(button3).toHaveText('ERROR: timeout 1');

      // Click button 2
      await button2.click();

      await expect(button1).toHaveText('PASS: Success 1');
      await expect(button2).toHaveText('ERROR: Error: failed 2');
      await expect(button3).toHaveText('ERROR: timeout 2');
    });
  });

  test.describe('styles', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/styles');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should load', async ({ page }) => {
      const parent = await page.locator('.parent');
      const child1 = await page.locator('text=Child 2');

      const addChild = await page.locator('button');
      await expect(parent).toHaveCSS('font-size', '200px');
      await expect(child1).toHaveCSS('font-size', '20px');

      const el = await page.$$('[q\\:style]');
      await expect(el.length).toBe(3);
      await addChild.click();
      await page.waitForTimeout(100);

      const child10 = await page.locator('text=Child 10');
      await expect(parent).toHaveCSS('font-size', '200px');
      await expect(child1).toHaveCSS('font-size', '20px');
      await expect(child10).toHaveCSS('font-size', '20px');

      const el2 = await page.$$('[q\\:style]');
      await expect(el2.length).toBe(3);
    });
  });

  test.describe('mount', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/mount');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should render logs correctly', async ({ page }) => {
      const btn = await page.locator('button');
      const logs = await page.locator('#logs');
      const renders = await page.locator('#renders');
      await expect(renders).toHaveText('Renders: 2');
      await expect(logs).toHaveText(`BEFORE useServerMount1()
AFTER useServerMount1()
BEFORE useMount2()
AFTER useMount2()
BEFORE useWatch3()
AFTER useWatch3()
BEFORE useServerMount4()
AFTER useServerMount4()`);

      await btn.click();
      await expect(renders).toHaveText('Renders: 3');
      await expect(logs).toHaveText(`BEFORE useServerMount1()
AFTER useServerMount1()
BEFORE useMount2()
AFTER useMount2()
BEFORE useWatch3()
AFTER useWatch3()
BEFORE useServerMount4()
AFTER useServerMount4()
Click`);
    });
  });

  test.describe('ref', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/ref');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should render correctly', async ({ page }) => {
      const staticEl = await page.locator('#static');
      const dynamic = await page.locator('#dynamic');
      await expect(staticEl).toHaveText('Rendered');
      await expect(dynamic).toHaveText('Rendered');
    });
  });

  test.describe('broadcast-events', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/broadcast-events');
      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    function tests() {
      test('should render correctly', async ({ page }) => {
        const document = await page.locator('p.document');
        const document2 = await page.locator('p.document2');

        const window = await page.locator('p.window');
        const window2 = await page.locator('p.window2');

        const self = await page.locator('p.self');
        const self2 = await page.locator('p.self2');

        await expect(document).toHaveText('(Document: x: 0, y: 0)');
        await expect(document2).toHaveText('(Document2: x: 0, y: 0)');
        await expect(window).toHaveText('(Window: x: 0, y: 0)');
        await expect(window2).toHaveText('(Window2: x: 0, y: 0)');
        await expect(self).toHaveText('(Host: x: 0, y: 0, inside: false)');
        await expect(self2).toHaveText('(Host2: x: 0, y: 0)');

        await page.mouse.move(100, 50);

        await expect(document).toHaveText('(Document: x: 100, y: 50)');
        await expect(document2).toHaveText('(Document2: x: 100, y: 50)');
        await expect(window).toHaveText('(Window: x: 100, y: 50)');
        await expect(window2).toHaveText('(Window2: x: 100, y: 50)');
        await expect(self).toHaveText('(Host: x: 0, y: 0, inside: false)');
        await expect(self2).toHaveText('(Host2: x: 0, y: 0)');

        await page.mouse.move(100, 300);

        await expect(document).toHaveText('(Document: x: 100, y: 300)');
        await expect(document2).toHaveText('(Document2: x: 100, y: 300)');
        await expect(window).toHaveText('(Window: x: 100, y: 300)');
        await expect(window2).toHaveText('(Window2: x: 100, y: 300)');
        await expect(self).toHaveText('(Host: x: 100, y: 300, inside: true)');
        await expect(self2).toHaveText('(Host2: x: 100, y: 300)');
      });
    }

    tests();

    test.describe('client rerender', () => {
      test.beforeEach(async ({ page }) => {
        const toggleRender = await page.locator('#btn-toggle-render');
        await toggleRender.click();
        await page.waitForTimeout(100);
      });
      tests();
    });
  });

  test.describe('streaming', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/streaming', {
        waitUntil: 'domcontentloaded',
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          expect(msg.text()).toEqual(undefined);
        }
      });

      page.on('pageerror', (err) => expect(err).toEqual(undefined));
    });

    test('should render correctly', async ({ page }) => {
      const ul = await page.locator('ul > li');
      const ol = await page.locator('ol > li');
      const cmps = await page.locator('.cmp');

      await expect(ul).toHaveCount(5);
      await expect(ol).toHaveCount(10);
      await expect(cmps).toHaveCount(5);
    });

    test('should rerender correctly', async ({ page }) => {
      const ul = await page.locator('ul > li');
      const ol = await page.locator('ol > li');
      const cmps = await page.locator('.cmp');
      const count = await page.locator('button#count');
      await count.click();

      await expect(count).toHaveText('Rerender 1');
      await expect(ul).toHaveCount(5);
      await expect(ol).toHaveCount(10);
      await expect(cmps).toHaveCount(5);
    });

    test('should render in client correctly', async ({ page }) => {
      const ul = await page.locator('ul > li');
      const ol = await page.locator('ol > li');
      const cmps = await page.locator('.cmp');
      const count = await page.locator('button#count');
      const rerender = await page.locator('button#client-render');
      await count.click();
      await expect(count).toHaveText('Rerender 1');

      await rerender.click();
      await page.waitForTimeout(500);
      await count.click();
      await page.waitForTimeout(3000);

      await expect(count).toHaveText('Rerender 0');
      await expect(ul).toHaveCount(0);
      await expect(ol).toHaveCount(0);
      await expect(cmps).toHaveCount(5);

      await count.click();
      await expect(count).toHaveText('Rerender 1');
    });
  });
});
