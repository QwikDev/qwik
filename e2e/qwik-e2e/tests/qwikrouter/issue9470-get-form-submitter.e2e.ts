import { expect, test } from '@playwright/test';

const cases = [
  {
    name: 'native form click includes the named submit button',
    button: 'native-open',
    scope: 'open',
    requestSubmit: false,
  },
  {
    name: 'native form requestSubmit includes the named submit button',
    button: 'native-open',
    scope: 'open',
    requestSubmit: true,
  },
  {
    name: 'GET Form click includes the named submit button',
    button: 'enhanced-open',
    scope: 'open',
    requestSubmit: false,
  },
  {
    name: 'GET Form click includes the submitter that was used',
    button: 'enhanced-closed',
    scope: 'closed',
    requestSubmit: false,
  },
  {
    name: 'GET Form requestSubmit includes the named submit button',
    button: 'enhanced-open',
    scope: 'open',
    requestSubmit: true,
  },
  {
    name: 'GET Form click without a named submitter omits the scope',
    button: 'enhanced-all',
    scope: '',
    requestSubmit: false,
  },
  {
    name: 'GET Form click keeps a hidden scope input',
    button: 'hidden-open',
    scope: 'open',
    requestSubmit: false,
  },
];

for (const fixture of cases) {
  test(fixture.name, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/qwikrouter-test/issue9470/');
    await expect(page.locator('h1')).toHaveText('Report search');
    await page.waitForFunction(() => (window as any)._qwikEv?.roots);
    const button = page.locator('#' + fixture.button);
    if (fixture.requestSubmit) {
      await button.evaluate((node: HTMLButtonElement) => node.form!.requestSubmit(node));
    } else {
      await button.click();
    }
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('release');
    await expect(page.locator('#shown')).toHaveText(`q=release;scope=${fixture.scope}`);
    await expect(page.locator('#navigating')).toHaveText('false');
    const url = new URL(page.url());
    expect(url.searchParams.get('scope') ?? '').toBe(fixture.scope);
    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
    await expect(page.locator('#reports li')).toHaveText(
      fixture.scope === 'open'
        ? ['Release checklist']
        : fixture.scope === 'closed'
          ? ['Archived release notes']
          : ['Release checklist', 'Archived release notes']
    );
    expect(errors).toEqual([]);
  });
}
