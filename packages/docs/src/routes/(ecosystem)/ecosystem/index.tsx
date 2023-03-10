import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import styles from '../ecosystem.css?inline';
import data from '../ecosystem.json';
import { MEDIA } from '../../media/index';

export default component$(() => {
  useStyles$(styles);

  const videos = MEDIA.videos.slice(0, 6);
  const podcasts = MEDIA.podcasts.slice(0, 6);
  const presentations = MEDIA.presentations.slice(0, 6);

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
          <Link href="/media/#videos">Videos</Link>
        </h2>
        <ul class="grid full-item">{videos.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/media/#podcasts">Podcasts</Link>
        </h2>
        <ul class="grid full-item">{podcasts.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/media/#presentations">Presentations</Link>
        </h2>
        <ul class="grid full-item">{presentations.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/community/groups/">Communities</Link>
        </h2>
        <ul class="grid">{data.communities.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/showcase/">Showcase</Link>
        </h2>
        <ul class="grid">{data.deployments.map(GridItem)}</ul>
      </section>

      <section>
        <h2>
          <Link href="/community/groups/">Social</Link>
        </h2>
        <ul class="grid">{data.social.map(GridItem)}</ul>
      </section>
    </article>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Ecosystem',
};

export function GridItem(props: GridItemProps) {
  return (
    <li key={props.title}>
      <Link href={props.href}>
        <span class="img">
          <img src={props.imgSrc} alt={props.title} />
        </span>
        <span>{props.title}</span>
      </Link>
    </li>
  );
}

interface GridItemProps {
  title: string;
  href: string;
  imgSrc: string;
}
