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
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/integrations/">Integrations</Link>
        </h2>
        <ul class="grid">{data.integrations.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/showcase/">Videos</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/media/#videos">Podcasts</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/media/#presentations">Presentations</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/community/groups/">Communities</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/showcase/">Showcase</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/community/groups/">Online</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>
    </article>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Ecosystem',
};

export function GridItem(props: GridItemProps) {
  return (
    <li key={props.name}>
      <Link href={props.url}>
        <span class="img">
          <img src={props.logo} alt={props.name + ' Logo'} />
        </span>
        <span>{props.name}</span>
      </Link>
    </li>
  );
}

interface GridItemProps {
  name: string;
  url: string;
  logo: string;
}
