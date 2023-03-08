import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import styles from './styles.css?inline';
import data from './ecosystem.json';

export default component$(() => {
  useStyles$(styles);

  return (
    <article class="ecosystem">
      <h1>Qwik Ecosystem</h1>

      <section>
        <h2>
          <Link href="/integrations/">Integrations</Link>
        </h2>
        <ul class="grid">
          {data.integrations.map((d) => (
            <li key={d.name}>
              <a href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/deployments/">Deployments</Link>
        </h2>
        <ul class="grid">
          {data.deployments.map((d) => (
            <li key={d.name}>
              <a href={d.url}>
                <span>
                  <img src={d.logo} alt={d.name + ' Logo'} />
                </span>
                <span>{d.name}</span>
              </a>
            </li>
          ))}
        </ul>
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
