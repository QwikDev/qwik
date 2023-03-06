import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import styles from './styles.css?inline';
import data from './ecosystem.json';

export default component$(() => {
  useStyles$(styles);

  return (
    <article class="ecosystem">
      <h1>Qwik Ecosystem</h1>

      <p>Seach available Qwik integrations and projects.</p>

      <section>
        <h2>Integrations</h2>
        <ul class="thumbnails">
          {data.integrations.map((integration) => (
            <li key={integration.name}>
              <a href={integration.url}>
                <span>
                  <img src={integration.url} alt={integration.name + ' Logo'} />
                </span>
                <span>{integration.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Integrations</h2>
        <p>This page missing any great site or in need of an update?</p>
        <p>
          <a
            href="https://github.com/BuilderIO/qwik/edit/main/packages/docs/scripts/pages.json"
            target="_blank"
            class="edit-page"
          >
            Edit this page!
          </a>
        </p>
      </section>
    </article>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Ecosystem',
};

export interface MediaEntry {
  title: string;
  href: string;
  imgSrc: string;
  size: 'small' | 'large';
  perf: {
    score: number;
    fcpDisplay: string;
    fcpScore: number;
    lcpDisplay: string;
    lcpScore: number;
    ttiDisplay: string;
    ttiScore: number;
    ttiTime: number;
  };
}
