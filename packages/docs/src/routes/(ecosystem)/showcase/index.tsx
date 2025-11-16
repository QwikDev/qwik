import { component$, useStyles$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import pages from './generated-pages.json';
import styles from './styles.css?inline';

export interface MediaEntry {
  title: string;
  href: string;
  imgSrc: string;
  size: 'small' | 'large';
  perf: {
    score: number;
    inpMs: number;
    clsScore: number;
    ttfbMs: number;
    fcpDisplay: string;
    fcpScore: number;
    lcpDisplay: string;
    lcpScore: number;
    ttiDisplay: string;
    ttiScore: number;
    ttiTime: number;
  };
}

export default component$(() => {
  useStyles$(styles);
  pages.sort(() => (Math.random() > 0.5 ? 1 : -1));
  const greatSites = pages.filter((site) => site.perf.score >= 0.9);
  const runnerUpSites = pages.filter((site) => site.perf.score >= 0.8 && site.perf.score < 0.9);
  return (
    <article class="showcase">
      <h1>Showcase</h1>

      <ul class="grid">
        {greatSites.map((entry) => (
          <SiteLink entry={entry as any} key={entry.href} />
        ))}
      </ul>
      <h1>Honorable Mentions</h1>

      <ul class="grid">
        {runnerUpSites.map((entry) => (
          <SiteLink entry={entry as any} key={entry.href} />
        ))}
      </ul>
      <section>
        <h2>How are the scores calculated?</h2>
        <p>
          The scores are calculated using the{' '}
          <a href="https://developers.google.com/speed/docs/insights/v5/get-started">
            PageSpeed Insights API
          </a>
          , analyzed with the{' '}
          <a href="https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed#strategy">
            MOBILE strategy
          </a>
          .
        </p>
      </section>
    </article>
  );
});

export const SiteLink = component$((props: { entry: MediaEntry }) => {
  const { size, href, imgSrc, perf, title } = props.entry;
  return (
    <li class={size}>
      <Score speedScore={perf.score} url={href}></Score>
      <a class="card" href={href} target="_blank" rel="nofollow noreferrer">
        <img width="1440" height="980" loading="lazy" src={imgSrc} aria-hidden="true" />
        <div class="backdrop">
          <div class="metrics">
            {perf.inpMs ? (
              <div
                style={{
                  '--color': getLighthouseColorForMs(perf.inpMs, 200, 500),
                }}
              >
                <h3>INP</h3>
                <p>{perf.inpMs}ms</p>
              </div>
            ) : (
              <div
                style={{
                  '--color': getLighthouseColorForScore(perf.ttiScore),
                }}
              >
                <h3>TTI</h3>
                <p>{perf.ttiDisplay}</p>
              </div>
            )}
            {perf.lcpDisplay ? (
              <div
                style={{
                  '--color': getLighthouseColorForScore(perf.lcpScore),
                }}
              >
                <h3>LCP</h3>
                <p>{perf.lcpDisplay}</p>
              </div>
            ) : (
              <div
                style={{
                  '--color': getLighthouseColorForScore(perf.fcpScore),
                }}
              >
                <h3>FCP</h3>
                <p>{perf.fcpDisplay}</p>
              </div>
            )}
            {perf.clsScore != null && (
              <div
                style={{
                  '--color': getLighthouseColorForCls(perf.clsScore),
                }}
              >
                <h3>CLS</h3>
                <p>{perf.clsScore}</p>
              </div>
            )}
            {perf.ttfbMs && (
              <div
                style={{
                  '--color': getLighthouseColorForMs(perf.ttfbMs, 800, 1800),
                }}
              >
                <h3>TTFB</h3>
                <p>{perf.ttfbMs}ms</p>
              </div>
            )}
          </div>
          <p class="title">{title}</p>
        </div>
      </a>
    </li>
  );
});

export const Score = ({ speedScore, url }: { speedScore: number; url: string }) => {
  return (
    <a
      class="score"
      style={{
        '--color': getLighthouseColorForScore(speedScore),
      }}
      title="Mobile perf score from PageSpeed Insights"
      target="_blank"
      rel="noreferrer"
      href={getPagespeedInsightsUrl(url)}
    >
      <div class="score-inner">
        <svg viewBox="0 0 120 120">
          <circle class="circle-1" r="56" cx="60" cy="60" stroke-width="8"></circle>
          <circle
            r="56"
            cx="60"
            cy="60"
            stroke-width="8"
            class="circle-2"
            style={{
              transform: `rotate(-87.9537deg)`,
              strokeDasharray: `${(speedScore * 350).toFixed(2)} 1000`,
            }}
          ></circle>
        </svg>
        <div class="score-text">{Math.round(speedScore * 100)}</div>
      </div>
    </a>
  );
};

const lighthouseRed = '#f33';
const lighthouseOrange = '#ffaa32';
const lighthouseGreen = '#0c6';

function getLighthouseColorForScore(score: number) {
  return score < 0.5 ? lighthouseRed : score < 0.9 ? lighthouseOrange : lighthouseGreen;
}
function getLighthouseColorForMs(ms: number, goodMs: number, badMs: number) {
  return ms < goodMs ? lighthouseGreen : ms < badMs ? lighthouseOrange : lighthouseRed;
}
function getLighthouseColorForCls(cls: number) {
  return cls < 0.1 ? lighthouseGreen : cls < 0.25 ? lighthouseOrange : lighthouseRed;
}
function getPagespeedInsightsUrl(url: string) {
  return `https://pagespeed.web.dev/report?url=${encodeURIComponent(url)}`;
}

export const head: DocumentHead = {
  title: 'Qwik Sites Showcase',
};
