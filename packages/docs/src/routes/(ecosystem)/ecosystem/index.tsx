import { component$, useContext, useStyles$, useTask$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import { GlobalStore } from '../../../context';
import styles from '../ecosystem.css?inline';
import data from '../ecosystem.json';
import { MEDIA } from '../media/index';
import SHOWCASE from '../showcase/generated-pages.json';
import { EcosystemMenu } from './ecosystem-menu';
import { QwikPlusLogo } from './qwik-plus-logo';

export default component$(() => {
  useStyles$(styles);

  const state = useContext(GlobalStore);
  const videos = MEDIA.videos.slice(0, 6);
  const podcasts = MEDIA.podcasts.slice(0, 6);
  const presentations = MEDIA.presentations.slice(0, 6);
  const showcaseSites = SHOWCASE.slice(0, 6);

  useTask$(() => {
    state.bodyClass = 'purple-bg';
  });

  return (
    <>
      <div class="ecosystem lg:grid grid-cols-[240px,1fr] px-6 m-auto max-w-screen-xl gap-8">
        <EcosystemMenu />

        <article>
          <QwikPlusLogo />

          <div class="purple-gradient" role="presentation" />
          <div class="blue-gradient" role="presentation" />

          <section id="deployments">
            <h2>
              <Link href="/deployments/">Deployments</Link>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {data.deployments.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section id="integrations">
            <h2>
              <span>
                <Link href="/integrations/">Integrations</Link>
              </span>
              <span>
                <Link href="/media/#videos" class="text-sm">
                  See All
                </Link>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {data.integrations.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section id="videos">
            <h2>
              <span>
                <Link href="/media/#videos">Videos</Link>
              </span>
              <span>
                <Link href="/media/#videos" class="text-sm">
                  See All
                </Link>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {videos.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section id="podcasts">
            <h2>
              <span>
                <Link href="/media/#podcasts">Podcasts</Link>
              </span>
              <span>
                <Link href="/media/#videos" class="text-sm">
                  See All
                </Link>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {podcasts.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section id="showcase">
            <h2>
              <span>
                <Link href="/showcase/">Showcase</Link>
              </span>
              <span>
                <Link href="/media/#videos" class="text-sm">
                  See All
                </Link>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {showcaseSites.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section id="presentations">
            <h2>
              <span>
                <Link href="/media/#presentations">Presentations</Link>
              </span>
              <span>
                <Link href="/media/#videos" class="text-sm">
                  See All
                </Link>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {presentations.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section id="community">
            <h2>
              <Link href="/community/groups/">Community</Link>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-4">
              {data.communities.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={false}
                />
              ))}
            </ul>
          </section>

          <section id="social">
            <h2>
              <Link href="/community/groups/">Social</Link>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {data.social.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  key={i}
                  thumbnailBg={false}
                />
              ))}
            </ul>
          </section>
        </article>
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Ecosystem',
};

export const GridItem = (props: GridItemProps) => {
  return (
    <li class="grid-item">
      <Link href={props.href}>
        <div class={{ thumbnail: props.thumbnailBg }}>
          <img src={props.imgSrc} alt={props.title} />
        </div>
        <div class="text">{props.title}</div>
      </Link>
    </li>
  );
};

interface GridItemProps {
  title: string;
  href: string;
  imgSrc: string;
  thumbnailBg: boolean;
}
