import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { InteractionLab } from '~/components/playground/interaction-lab';
import { PlaygroundGlyph } from '~/components/playground/icons';
import { featureCards, homeMetrics, quickJumpCards } from '~/content/playground-content';

export const useCommandCenterData = routeLoader$(async () => {
  const now = new Date();

  return {
    serverTime: new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(now),
    routeStatus: 'SWR cache enabled',
    inspectionHint: 'Qwik Devtools plugin is injected through Vite.',
  };
});

const featureGlyphs: Record<string, 'route' | 'stack' | 'pulse' | 'spark' | 'notes'> = {
  routing: 'route',
  resumability: 'stack',
  resources: 'pulse',
  events: 'spark',
  state: 'stack',
  visibility: 'notes',
} as const;

export default component$(() => {
  const commandCenter = useCommandCenterData();

  return (
    <div class="page-content">
      <section class="hero-layout section-card">
        <div class="hero-copy glass-frame">
          <div class="eyebrow-chip">Command Center</div>
          <h1>Qwik demo surfaces can feel like products, not placeholder scaffolds.</h1>
          <p class="hero-lead">
            This playground now behaves like a compact showcase site: atmospheric enough for demos,
            structured enough for routing checks, and alive enough for devtools inspection.
          </p>

          <div class="hero-actions">
            <Link class="hero-button hero-button--primary" href="/about">
              Explore architecture
            </Link>
            <Link class="hero-button" href="/blog">
              Read lab notes
            </Link>
          </div>

          <div class="hero-status-grid">
            <div class="hero-status-card">
              <span>Server time</span>
              <strong>{commandCenter.value.serverTime}</strong>
            </div>
            <div class="hero-status-card">
              <span>Route status</span>
              <strong>{commandCenter.value.routeStatus}</strong>
            </div>
            <div class="hero-status-card">
              <span>Inspection hint</span>
              <strong>{commandCenter.value.inspectionHint}</strong>
            </div>
          </div>
        </div>

        <div class="hero-sidebar">
          {homeMetrics.map((metric) => (
            <div class="metric-tower glass-frame" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Capability Gallery</div>
          <h2>
            Modern playgrounds are easier to trust when they make state, routes, and variation
            observable.
          </h2>
        </div>

        <div class="feature-grid">
          {featureCards.map((feature) => (
            <article class={`capability-card capability-card--${feature.accent}`} key={feature.id}>
              <div class="capability-card__header">
                <div>
                  <div class="feature-eyebrow">{feature.eyebrow}</div>
                  <h3>{feature.title}</h3>
                </div>
                <div class="capability-card__icon">
                  <PlaygroundGlyph
                    class="capability-card__glyph"
                    name={featureGlyphs[feature.id]}
                  />
                </div>
              </div>
              <p>{feature.description}</p>
              <ul class="feature-points">
                {feature.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Live Experiment</div>
          <h2>
            One shared panel for controls, async transitions, environment context, and route-aware
            events.
          </h2>
        </div>

        <InteractionLab serverTime={commandCenter.value.serverTime} />
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Quick Jumps</div>
          <h2>
            Use the surrounding routes as part of the demo surface, not as leftover boilerplate.
          </h2>
        </div>

        <div class="jump-grid">
          {quickJumpCards.map((card) => (
            <Link class="jump-card glass-frame" href={card.href} key={card.href}>
              <div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
              <PlaygroundGlyph class="jump-card__glyph" name="arrow-up-right" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Command Center | Qwik Playgrounds',
  meta: [
    {
      name: 'description',
      content:
        'A richer Qwik playground with route demos, async experiments, and a glass-panel visual system.',
    },
  ],
};
