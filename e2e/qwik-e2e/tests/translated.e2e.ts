import { test, expect, type Page } from '@playwright/test';

/** Does what Google Translate does: marks `<html>`, then swaps every text node for a wrapper. */
const translate = (page: Page) =>
  page.evaluate(async () => {
    document.documentElement.classList.add('translated-ltr');
    // The real translator waits for the network here.
    await new Promise((resolve) => setTimeout(resolve));
    const originals = ((window as any).originals = new Map<Element, Text>());
    const walker = document.createTreeWalker(
      document.querySelector('#translated')!,
      NodeFilter.SHOW_TEXT
    );
    const texts: Text[] = [];
    while (walker.nextNode()) {
      texts.push(walker.currentNode as Text);
    }
    for (const text of texts) {
      if (text.nodeValue!.trim()) {
        const wrapper = document.createElement('font');
        wrapper.style.verticalAlign = 'inherit';
        const inner = wrapper.cloneNode() as Element;
        inner.textContent = `[${text.nodeValue}]`;
        wrapper.append(inner);
        text.before(wrapper);
        text.remove();
        originals.set(wrapper, text);
      }
    }
  });

/** Puts the original text nodes back, like the translator's "show original". */
const showOriginal = (page: Page) =>
  page.evaluate(() => {
    for (const [wrapper, text] of (window as any).originals as Map<Element, Text>) {
      if (wrapper.isConnected) {
        wrapper.before(text);
        wrapper.remove();
      }
    }
  });

const failOnPageErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

/** Collects the errors that Qwik reports to the app. */
const collectQErrors = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('qerror', (event) => {
      ((window as any).qErrors ||= []).push(String((event as CustomEvent).detail.error));
    });
  });

test.describe('translated page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/translated');
    failOnPageErrors(page);
  });

  test.describe('translated before the first interaction', () => {
    test('updates a number that is the only text of its element', async ({ page }) => {
      await translate(page);
      await page.locator('#count').click();
      await expect(page.locator('#only')).toHaveText('6');
    });

    test('rewrites a sentence when its component renders again', async ({ page }) => {
      await translate(page);
      await page.locator('#count').click();
      await expect(page.locator('#sentence')).toHaveText(
        'You have clicked the button 6 times so far.'
      );
    });

    test('removes and adds back a conditional sentence', async ({ page }) => {
      await translate(page);
      await page.locator('#toggle').click();
      await expect(page.locator('#conditional')).toHaveText('[Bold neighbor.]');
      await page.locator('#toggle').click();
      await expect(page.locator('#conditional')).toHaveText(
        'A conditional sentence.[Bold neighbor.]'
      );
    });

    test('removes a conditional sentence after show original', async ({ page }) => {
      await translate(page);
      await page.locator('#count').click();
      await expect(page.locator('#only')).toHaveText('6');
      await showOriginal(page);
      await page.locator('#toggle').click();
      await expect(page.locator('#conditional')).toHaveText('Bold neighbor.');
    });
  });

  test.describe('translated after the first interaction', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('#count').click();
      await expect(page.locator('#only')).toHaveText('6');
      await translate(page);
    });

    test('updates the number inside a translated sentence', async ({ page }) => {
      await page.locator('#count').click();
      await expect(page.locator('#sentence')).toHaveText(
        '[You have clicked the button ]7[ times so far.]'
      );
    });

    test('updates text that was reordered while translated', async ({ page }) => {
      await page.locator('#reverse').click();
      await expect(page.locator('#words')).toHaveText('[beta 6][alpha 6]');
      await page.locator('#count').click();
      await expect(page.locator('#words')).toHaveText('beta 7alpha 7');
    });

    test('updates the number after show original', async ({ page }) => {
      await showOriginal(page);
      await page.locator('#count').click();
      await expect(page.locator('#sentence')).toHaveText(
        'You have clicked the button 7 times so far.'
      );
    });
  });
});

test.describe('translated page whose sentence never renders again', () => {
  const sentence = (page: Page) => page.locator('#sentence');

  test('rewrites the sentence when the preloader saw the translation', async ({ page }) => {
    await page.goto('/translated.prod/');
    failOnPageErrors(page);
    await page.waitForFunction(() => !!(window as any).qPreload);
    await translate(page);
    await page.locator('#count').click();
    await expect(sentence(page)).toHaveText('You have clicked the button 6 times so far.');
  });

  test('keeps the translation and reports it when nothing saw it happen', async ({ page }) => {
    await collectQErrors(page);
    await page.addInitScript(() => delete (window as any).MutationObserver);
    await page.goto('/translated.prod/');
    await translate(page);
    await page.locator('#count').click();
    await expect(sentence(page)).toHaveText('6[You have clicked the button 5 times so far.]');
    expect(await page.evaluate(() => (window as any).qErrors)).toEqual([
      expect.stringContaining('Code(Q42)'),
    ]);
  });
});

test.describe('translated page of an app without the pageTranslation flag', () => {
  test('reports once that translated text can not be updated', async ({ page }) => {
    await collectQErrors(page);
    await page.goto('/translated-unsupported.prod/');
    await translate(page);
    await page.locator('#count').click();
    await page.locator('#count').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).qErrors))
      .toEqual([expect.stringContaining('Code(Q42)')]);
  });
});
