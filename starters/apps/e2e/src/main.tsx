import { component$, $ } from '@builder.io/qwik';

import './global.css';

export const Main = component$(() => {
  return $(() => {
    return (
      <section>
        <p>
          <a href="/slot">Slot</a>
        </p>
        <p>
          <a href="/render">Render</a>
        </p>
        <p>
          <a href="/lexical-scope">Lexical scope</a>
        </p>
        <p>
          <a href="/two-listeners">Two listener</a>
        </p>
      </section>
    );
  });
});
