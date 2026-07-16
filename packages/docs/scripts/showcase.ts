import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { chromium, devices, type Page } from 'playwright';
import pages from './pages.json' with { type: 'json' };

type InputPageData = {
  href: string;
  tags?: string[];
  size?: 'small' | 'large';
  repo?: string;
};
type PageData = InputPageData & {
  title?: string;
  imgSrc?: string;
  perf?: {
    score?: number;
    inpMs?: number;
    clsScore?: number;
    ttfbMs?: number;
    fcpDisplay?: string;
    fcpScore?: number;
    lcpDisplay?: string;
    lcpScore?: number;
    ttiDisplay?: string;
    ttiScore?: number;
    ttiTime?: number;
  };
  version?: string;
  ts: number;
};
const OUTPUT_JSON = 'src/routes/(ecosystem)/showcase/generated-pages.json';
async function captureMultipleScreenshots() {
  if (!existsSync('public/showcases')) {
    mkdirSync('public/showcases');
  }

  let browser = null;
  try {
    // launch headless Chromium browser
    browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      // pretend to be a desktop browser
      ...devices['Desktop Chrome'],
    });
    let existingJson: PageData[] = [];
    try {
      const data = readFileSync(OUTPUT_JSON, 'utf8');
      existingJson = JSON.parse(data) as PageData[];
    } catch {
      // ignore
    }

    for (const pageData of pages) {
      let page: Page;
      try {
        page = await context.newPage();

        // set viewport width and height
        await page.setViewportSize({
          width: 1440,
          height: 980,
        });

        const href = pageData.href;
        let existing = existingJson.find((item) => item.href === href);
        if (!existing) {
          existing = { ...pageData, ts: 0 } as PageData;
          existingJson.push(existing);
        }
        if (Date.now() - existing.ts < 1000 * 60 * 60 * 24 * 7) {
          console.log('Skipping recently updated', href);
          continue;
        }
        console.log('Opening page', href);
        await page.goto(href);

        const title = await page.title();
        const html = page.locator('html');
        const hasContainer = await html.evaluate((node) => node.hasAttribute('q:container'));
        if (!hasContainer) {
          console.warn('❌ Not a Qwik Site', href, await html.getAttribute('q:container'));
          existingJson.splice(existingJson.indexOf(existing), 1);
          writeFileSync(OUTPUT_JSON, JSON.stringify(existingJson, undefined, 2) + '\n');
          continue;
        }
        const version = await html.getAttribute('q:version');
        const filename = href
          .replace('https://', '')
          .replace('/', '_')
          .replace('.', '_')
          .replace('.', '_')
          .toLowerCase();

        await wait(5000);
        const path = `public/showcases/${filename}.jpeg`;
        const [pagespeedOutput, _] = await Promise.all([
          getPagespeedData(href),
          page.screenshot({
            path: path,
            type: 'jpeg',
            quality: 50,
          }),
        ]);
        const fcpDisplay =
          pagespeedOutput.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue;
        const fcpScore =
          pagespeedOutput?.lighthouseResult?.audits?.['first-contentful-paint']?.score;

        const lcpDisplay =
          pagespeedOutput?.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue;
        const lcpScore =
          pagespeedOutput?.lighthouseResult?.audits?.['largest-contentful-paint']?.score;

        const loadExpMetrics = pagespeedOutput.loadingExperience?.metrics;
        // ms score of the 75th percentile of the page users
        const inpMs = loadExpMetrics?.INTERACTION_TO_NEXT_PAINT?.percentile;
        // no unit, less than 0.1 is good
        const clsScore = loadExpMetrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile / 100;
        // not core but interesting
        const ttfbMs = loadExpMetrics?.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile;

        const ttiDisplay = pagespeedOutput?.lighthouseResult?.audits?.interactive?.displayValue;
        const ttiScore = pagespeedOutput?.lighthouseResult?.audits?.interactive?.score;

        const ttiTime = pagespeedOutput?.lighthouseResult?.audits?.interactive?.numericValue;

        const score = pagespeedOutput?.lighthouseResult?.categories?.performance?.score;
        const perf = {
          score,
          inpMs,
          clsScore,
          ttfbMs,
          fcpDisplay,
          fcpScore,
          lcpDisplay,
          lcpScore,
          ttiDisplay,
          ttiScore,
          ttiTime,
        };
        Object.assign(existing, {
          ...pageData,
          ts: Date.now(),
          title,
          imgSrc: `/showcases/${filename}.jpeg`,
          perf,
          version,
        });
        writeFileSync(OUTPUT_JSON, JSON.stringify(existingJson, undefined, 2) + '\n');
        console.log(`✅ ${title} - (${href})`);
      } catch (err) {
        console.error(err);
      } finally {
        if (page!) {
          await page.close();
        }
      }
    }
  } catch (err) {
    console.log(`❌ Error: ${(err as Error)?.message || err}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log(`\n🎉 ${pages.length} screenshots captured.`);
  }
}

async function getPagespeedData(url: string) {
  const requestURL = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    url
  )}&key=AIzaSyApBC9gblaCzWrtEBgHnZkd_B37OF49BfM&category=PERFORMANCE&strategy=MOBILE`;
  return await fetch(requestURL, {
    headers: {
      referer: 'https://www.builder.io/',
    },
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json() as Promise<{
      lighthouseResult: any;
      loadingExperience: any;
      pagespeedResult: any;
    }>;
  });
}
captureMultipleScreenshots();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
