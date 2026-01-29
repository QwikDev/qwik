import { expect, test } from '@playwright/test';

test.describe('[SSR]', () => {
  test('should NOT call unmount callback for non hydrated component', async ({ page }) => {
    page.on('console', () => {
      throw new Error("React component shouldn't hydrate");
    });

    await page.goto('/react');

    expect(await page.getByTestId('count').innerText()).toBe('count 0');

    // unmount
    await page.getByTestId('qwik-link').click();
    await page.waitForURL('/', { waitUntil: 'networkidle' });

    expect(await page.textContent('main')).toBe('render qwik');
  });

  test('should call unmount callback for hydrated component', async ({ page }) => {
    await page.goto('/react');

    expect(await page.getByTestId('count').innerText()).toBe('count 0');

    // hydrate
    const mountConsole = page.waitForEvent('console');
    await page.getByTestId('test-component').hover();

    // check if hydrated and called useEffect
    const mountMsg = await mountConsole;
    expect(await mountMsg.args()[0].jsonValue()).toBe('@@@@ Mount');

    // check if react works
    await page.getByTestId('inc-btn').click();
    expect(await page.getByTestId('count').innerText()).toBe('count 1');

    // unmount
    const unmountConsole = page.waitForEvent('console');
    await page.getByTestId('qwik-link').click();

    const unmountMsg = await unmountConsole;
    expect(await unmountMsg.args()[0].jsonValue()).toBe('@@@@ Unmount');
  });
});

test.describe('[CSR]', () => {
  test('should call unmount callback', async ({ page }) => {
    await page.goto('/');

    // csr
    const mountConsole = page.waitForEvent('console');
    await page.getByTestId('react-link').click();
    await page.waitForURL('/react/', { waitUntil: 'networkidle' });

    expect(await page.getByTestId('count').innerText()).toBe('count 0');

    // check if called useEffect
    const mountMsg = await mountConsole;
    expect(await mountMsg.args()[0].jsonValue()).toBe('@@@@ Mount');

    // check if react works
    await page.getByTestId('inc-btn').click();
    expect(await page.getByTestId('count').innerText()).toBe('count 1');

    // unmount
    const unmountConsole = page.waitForEvent('console');
    await page.getByTestId('qwik-link').click();
    await page.waitForURL('/', { waitUntil: 'networkidle' });

    const unmountMsg = await unmountConsole;
    expect(await unmountMsg.args()[0].jsonValue()).toBe('@@@@ Unmount');
  });
});
