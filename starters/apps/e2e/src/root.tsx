import { component$ } from '@builder.io/qwik';

import './global.css';

export const Root = component$(() => {
  return (
    <section>
      <p>
        <a href="/e2e/slot">Slot</a>
      </p>
      <p>
        <a href="/e2e/render">Render</a>
      </p>
      <p>
        <a href="/e2e/lexical-scope">Lexical scope</a>
      </p>
      <p>
        <a href="/e2e/two-listeners">Two listener</a>
      </p>
      <p>
        <a href="/e2e/events">Events</a>
      </p>
      <p>
        <a href="/e2e/async">Async</a>
      </p>
      <p>
        <a href="/e2e/container">Container</a>
      </p>
      <p>
        <a href="/e2e/factory">Factory</a>
      </p>
      <p>
        <a href="/e2e/watch">Watch</a>
      </p>
      <p>
        <a href="/e2e/effect-client">Client effect</a>
      </p>
      <p>
        <a href="/e2e/context">Context</a>
      </p>
      <p>
        <a href="/e2e/toggle">Toggle</a>
      </p>
      <p>
        <a href="/e2e/styles">Styles</a>
      </p>
      <p>
        <a href="/e2e/broadcast-events">Broadcast events</a>
      </p>
      <p>
        <a href="/e2e/weather">Weather app</a>
      </p>
      <p>
        <a href="/e2e/resource">Resource</a>
      </p>
    </section>
  );
});
