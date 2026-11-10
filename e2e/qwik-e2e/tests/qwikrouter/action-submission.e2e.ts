import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/qwikrouter-test/actions/issue9238/');
});

for (const failure of ['network', 'html', 'invalid-json'] as const) {
  test(`settles submit and permits retry after ${failure} failure`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*qaction=*', (route) =>
      failure === 'network'
        ? route.abort('failed')
        : route.fulfill({
            status: 502,
            contentType: failure === 'html' ? 'text/html' : 'application/json',
            body: failure === 'html' ? '<h1>Bad Gateway</h1>' : '{invalid',
          })
    );

    await page.locator('#programmatic-submit').click();
    await expect(page.locator('#outcome')).toHaveText('rejected', { timeout: 5000 });
    await expect(page.locator('#is-running')).toHaveText('false');
    await expect(page.locator('#is-navigating')).toHaveText('false');
    expect(errors).toEqual([]);

    await page.unroute('**/*qaction=*');
    await page.locator('#programmatic-submit').click();
    await expect(page.locator('#outcome')).toHaveText('resolved');
    await expect(page.locator('#is-running')).toHaveText('false');
    await expect(page.locator('#is-navigating')).toHaveText('false');
  });
}

test('marks the action running before dispatching it', async ({ page }) => {
  await page.locator('#programmatic-submit').click();
  await expect(page.locator('#outcome')).toHaveText('resolved');
  await expect(page.locator('#was-running')).toHaveText('true');
});

test('keeps a form submission when the same action runs during validation', async ({ page }) => {
  await page.goto('/qwikrouter-test/actions/issue9238/?delay');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/issue9238-ready', async (route) => {
    await pending;
    await route.fulfill({ status: 204 });
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('qaction=')) {
      requests.push(request.postData() ?? '');
    }
  });

  try {
    await page.locator('#submission-value').fill('form-request');
    await page.locator('#single-submit').click();
    await expect(page.locator('#handlers')).toHaveText('1');
    await page.locator('#programmatic-submit').click();
    await expect(page.locator('#outcome')).toHaveText('resolved');
    release();
    await expect(page.locator('#completed')).toHaveText('1', { timeout: 5000 });
    await expect(page.locator('#saved-value')).toHaveText('form-request');
    expect(requests).toHaveLength(2);
  } finally {
    release();
  }
});

test('runs synchronous submit handlers before propagating the event', async ({ page }) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      await page.locator('#replace-sync-form').click();
    }
    await page.locator('#sync-submit').click();
    await expect(page.locator('#completed')).toHaveText(String(attempt));
    await expect(page.locator('#submit-parent')).toHaveAttribute('data-submits', '0', {
      timeout: 5000,
    });
    await expect(page.locator('#sync-submit').locator('..')).toHaveAttribute(
      'data-handler-order',
      'sync,async'
    );
  }
});

test('preserves synchronous event handling while ignoring a repeated submission', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route('**/*qaction=*', async (route) => {
    posts++;
    await pending;
    await route.continue();
  });

  try {
    await page.locator('#sync-submit').evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    const form = page.locator('#sync-submit').locator('..');
    await expect(form).toHaveAttribute('data-sync-calls', '2');
    await expect(form).toHaveAttribute('data-async-calls', '1');
    await expect(page.locator('#submit-parent')).toHaveAttribute('data-submits', '0');
    await expect.poll(() => posts).toBe(1);
    release();
    await expect(page.locator('#completed')).toHaveText('1');
    expect(posts).toBe(1);
  } finally {
    release();
  }
});

test('locks the form before awaiting its submit handlers', async ({ page }) => {
  await page.goto('/qwikrouter-test/actions/issue9238/?delay');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/issue9238-ready', async (route) => {
    await pending;
    await route.fulfill({ status: 204 });
  });

  try {
    await page.locator('#single-submit').click();
    await expect(page.locator('#handlers')).toHaveText('1');
    await expect(page.locator('#is-running')).toHaveText('false');
    await page.locator('#single-submit').click();
    release();
    await page.locator('#check-queue').click();
    await expect(page.locator('#checked')).toHaveText('1');
    await expect(page.locator('#handlers')).toHaveText('1');
    await expect(page.locator('#completed')).toHaveText('1');
  } finally {
    release();
  }
});

test('releases the form after its submit handler throws', async ({ page }) => {
  await page.goto('/qwikrouter-test/actions/issue9238/?throw');
  await page.locator('#single-submit').click();
  await page.locator('#check-queue').click();
  await expect(page.locator('#checked')).toHaveText('1');
  await expect(page.locator('#handlers')).toHaveText('1');
  await expect(page.locator('#completed')).toHaveText('0');

  await page.locator('#single-submit').click();
  await expect(page.locator('#handlers')).toHaveText('2');
  await expect(page.locator('#saved-intent')).toHaveText('save');
  await expect(page.locator('#is-running')).toHaveText('false');
});

for (const failure of ['network', 'html', 'invalid-json'] as const) {
  test(`releases the form after ${failure} failure`, async ({ page }) => {
    let posts = 0;
    await page.route('**/*qaction=*', (route) => {
      posts++;
      return failure === 'network'
        ? route.abort('failed')
        : route.fulfill({
            status: 502,
            contentType: failure === 'html' ? 'text/html' : 'application/json',
            body: failure === 'html' ? '<h1>Bad Gateway</h1>' : '{invalid',
          });
    });
    await page.locator('#single-submit').click();
    await expect.poll(() => posts).toBe(1);
    await page.locator('#check-queue').click();
    await expect(page.locator('#checked')).toHaveText('1');
    expect(posts).toBe(1);
    await expect(page.locator('#is-running')).toHaveText('false');
    await expect(page.locator('#is-navigating')).toHaveText('false');

    await page.unroute('**/*qaction=*');
    await page.locator('#single-submit').click();
    await expect(page.locator('#saved-intent')).toHaveText('save');
    await expect(page.locator('#is-running')).toHaveText('false');
  });
}

for (const scenario of ['bare', 'single', 'single-reset', 'array', 'manual']) {
  test(`handles the ${scenario} form once while pending and again after completion`, async ({
    page,
  }) => {
    const form = scenario === 'single-reset' ? 'single' : scenario;
    const submissionsPerEvent = form === 'manual' ? 2 : 1;
    if (scenario === 'single-reset') {
      await page.goto('/qwikrouter-test/actions/issue9238/?reset');
      await page.locator('#submission-value').fill('original');
    }
    if (form === 'single') {
      await page.locator('#submission-file').setInputFiles({
        name: 'same.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('a'),
      });
    }
    let posts = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/*qaction=*', async (route) => {
      posts++;
      await pending;
      await route.continue();
    });

    await page.locator(`#${form}-submit`).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.locator('#handlers')).toHaveText(form === 'bare' ? '0' : '1');
    await expect(page.locator('#is-running')).toHaveText('true');
    await expect.poll(() => posts).toBeGreaterThan(0);
    release();
    await page.locator('#check-queue').click();
    await expect(page.locator('#checked')).toHaveText('1');
    await expect(page.locator('#handlers')).toHaveText(form === 'bare' ? '0' : '1');
    await expect(page.locator('#completed')).toHaveText(String(submissionsPerEvent));
    await expect(page.locator('#is-running')).toHaveText('false');

    if (scenario === 'single-reset') {
      await expect(page.locator('#submission-value')).toHaveValue('');
      await page.locator('#submission-value').fill('retry');
    }
    await page.locator(`#${form}-submit`).click();
    await page.locator('#check-queue').click();
    await expect(page.locator('#checked')).toHaveText('2');
    await expect(page.locator('#completed')).toHaveText(String(submissionsPerEvent * 2));
    await expect(page.locator('#handlers')).toHaveText(form === 'bare' ? '0' : '2');
    if (scenario === 'single-reset') {
      await expect(page.locator('#saved-value')).toHaveText('retry');
    }
    expect(posts).toBe(submissionsPerEvent * 2);
  });
}

for (const reset of [false, true]) {
  for (const change of ['value', 'file', 'submitter']) {
    test(`ignores a pending submission with a changed ${change}, spaReset=${reset}`, async ({
      page,
    }) => {
      if (reset) {
        await page.goto('/qwikrouter-test/actions/issue9238/?reset');
      }
      let posts = 0;
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/*qaction=*', async (route) => {
        posts++;
        if (posts === 1) {
          await pending;
        }
        await route.continue();
      });
      const value = page.locator('#submission-value');
      const file = page.locator('#submission-file');
      await value.fill('older');
      if (change === 'file') {
        await file.setInputFiles({
          name: 'same.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('a'),
        });
      }
      try {
        await page.locator('#single-submit').click();
        await expect.poll(() => posts).toBe(1);
        if (change === 'value') {
          await value.fill('newer');
        }
        if (change === 'file') {
          await file.setInputFiles({
            name: 'same.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('b'),
          });
        }
        await page
          .locator(change === 'submitter' ? '#changed-submitter' : '#single-submit')
          .click();
        release();
        await page.locator('#check-queue').click();
        await expect(page.locator('#checked')).toHaveText('1');
        await expect(page.locator('#completed')).toHaveText('1', { timeout: 5000 });
        await expect(page.locator('#handlers')).toHaveText('1');
        await expect(page.locator('#saved-value')).toHaveText('older');
        expect(posts).toBe(1);
        if (change === 'file') {
          await expect(page.locator('#saved-file')).toHaveText('a');
        }
        if (change === 'submitter') {
          await expect(page.locator('#saved-intent')).toHaveText('save');
        }
      } finally {
        release();
      }
    });
  }
}

for (const payload of ['event', 'form-data', 'object']) {
  test(`keeps manual ${payload} submissions independent from the form event`, async ({ page }) => {
    let posts = 0;
    await page.route('**/*qaction=*', async (route) => {
      posts++;
      await route.continue();
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      await page
        .locator(payload === 'event' ? '#manual-submit' : `#manual-${payload}-submit`)
        .click();
      await expect(page.locator('#completed')).toHaveText(String(attempt * 2));
      await page.locator('#check-queue').click();
      await expect(page.locator('#checked')).toHaveText(String(attempt));
      expect(posts).toBe(attempt * 2);
      await expect(page.locator('#saved-value')).toHaveText('saved');
    }
  });
}

test('releases the form lock after its submit handler chunk fails to load', async ({ page }) => {
  const submitChunk = /Form_form_q_e_submit/;
  let blocked = 0;
  await page.route(submitChunk, (route) => {
    blocked++;
    return route.abort('failed');
  });
  await page.goto('/qwikrouter-test/actions/issue9238/');
  await page.locator('#bare-submit').click();
  await expect.poll(() => blocked).toBeGreaterThan(0);

  // Chromium caches failed imports, so a retry cannot prove the lock is released.
  await expect
    .poll(() =>
      page
        .locator('#bare-submit')
        .evaluate((button: HTMLButtonElement) => '_qSubmit' in button.form!)
    )
    .toBe(false);
});

test('settles a submission superseded while the router config loads', async ({ page }) => {
  const routerConfig = /qwik-router-config/;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let configRequests = 0;
  await page.route(routerConfig, async (route) => {
    configRequests++;
    await pending;
    await route.continue();
  });
  await page.goto('/qwikrouter-test/actions/issue9238/');

  try {
    await page.locator('#programmatic-submit').click();
    await expect(page.locator('#outcome')).toHaveText('pending');
    await expect.poll(() => configRequests).toBeGreaterThan(0);
    await page.locator('#reload').click();
    release();
    await expect(page.locator('#outcome')).toHaveText('rejected');
    await expect(page.locator('#is-running')).toHaveText('false');
  } finally {
    release();
  }
});
