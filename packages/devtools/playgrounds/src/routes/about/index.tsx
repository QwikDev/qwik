import type { DocumentHead } from '@qwik.dev/router';
import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { PlaygroundGlyph } from '~/components/playground/icons';
import { aboutPrinciples, visualSystemRules } from '~/content/playground-content';

export default component$(() => {
  return (
    <div class="page-content">
      <section class="page-hero glass-frame">
        <div class="eyebrow-chip">Architecture + Design Rules</div>
        <h1>The playground exists to show how a demo can become a credible inspection target.</h1>
        <p class="hero-lead">
          Instead of treating this app as disposable sample code, the redesign treats it as a
          miniature product surface. That makes route transitions, async states, and state graphs
          easier to reason about during demos and while using devtools.
        </p>
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Operating Principles</div>
          <h2>Four rules shape the structure of the site and the behavior of the live demo.</h2>
        </div>

        <div class="principles-grid">
          {aboutPrinciples.map((item) => (
            <article class="principle-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section class="section-card split-section">
        <div class="glass-frame split-callout">
          <div class="eyebrow-chip">Inspection Guide</div>
          <h2>What to verify with Devtools</h2>
          <div class="inspection-list">
            <div class="inspection-row">
              <PlaygroundGlyph class="inspection-row__icon" name="route" />
              <div>
                <strong>Routing continuity</strong>
                <p>
                  Move between the command center, notes list, and detail route to watch location
                  updates.
                </p>
              </div>
            </div>
            <div class="inspection-row">
              <PlaygroundGlyph class="inspection-row__icon" name="pulse" />
              <div>
                <strong>Resource transitions</strong>
                <p>
                  Use the async panel to toggle pending, empty, and error without wiring a backend.
                </p>
              </div>
            </div>
            <div class="inspection-row">
              <PlaygroundGlyph class="inspection-row__icon" name="stack" />
              <div>
                <strong>State compression</strong>
                <p>
                  Check how signals and derived metrics are grouped into readable cards instead of
                  raw dumps.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="glass-frame split-callout">
          <div class="eyebrow-chip">Visual Grammar</div>
          <h2>Local rules for future expansion</h2>
          <div class="rules-list">
            {visualSystemRules.map((rule) => (
              <div class="rule-row" key={rule.title}>
                <strong>{rule.title}</strong>
                <p>{rule.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Next Routes</div>
          <h2>Continue into content flows that exercise nested navigation and long-form layout.</h2>
        </div>

        <div class="jump-grid">
          <Link class="jump-card glass-frame" href="/blog">
            <div>
              <h3>Browse lab notes</h3>
              <p>Open the list view with tags, statuses, and article cards.</p>
            </div>
            <PlaygroundGlyph class="jump-card__glyph" name="arrow-up-right" />
          </Link>
          <Link class="jump-card glass-frame" href="/blog/latency-without-chaos">
            <div>
              <h3>Read the nested article</h3>
              <p>Inspect article typography, code blocks, and route depth in one move.</p>
            </div>
            <PlaygroundGlyph class="jump-card__glyph" name="arrow-up-right" />
          </Link>
        </div>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Architecture | Qwik Playgrounds',
  meta: [
    {
      name: 'description',
      content: 'Architecture notes and local design rules for the Qwik playground demo.',
    },
  ],
};
