import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import styles from '../ecosystem.css?inline';
import data from '../ecosystem.json';

export default component$(() => {
  useStyles$(styles);

  return (
    <article class="ecosystem">
      <h1>Qwik+</h1>

      <section>
        <h2>
          <Link href="/deployments/">Deployments</Link>
        </h2>

        <ul class="grid">
          {data.deployments.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <span>
                  <img src={d.logo} alt={d.name + ' Logo'} />
                </span>
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/integrations/">Integrations</Link>
        </h2>
        <ul class="grid">
          {data.integrations.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/showcase/">Videos</Link>
        </h2>
        <ul class="grid">
          {data.integrations.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/media/#videos">Podcasts</Link>
        </h2>
        <ul class="grid">
          {data.integrations.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/media/#presentations">Presentations</Link>
        </h2>
        <ul class="grid">
          {data.integrations.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/community/groups/">Communities</Link>
        </h2>
        <ul class="grid">
          {data.communities.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/showcase/">Showcase</Link>
        </h2>
        <ul class="grid">
          {data.integrations.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>
          <Link href="/community/groups/">Online</Link>
        </h2>
        <ul class="grid">
          {data.online.map((d) => (
            <li key={d.name}>
              <Link href={d.url}>
                <img src={d.logo} alt={d.name + ' Logo'} />
                <span>{d.name}</span>
              </Link>
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
