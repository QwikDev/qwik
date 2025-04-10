import { component$, useStyles$, type FunctionComponent } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import ImgQwikNewsletter from '~/media/ecosystem/qwik-newsletter.svg?jsx';
import styles from '../ecosystem.css?inline';
import data from '../ecosystem.json';
import { MEDIA, type MediaEntry } from '../media/index';
import SHOWCASE from '../showcase/generated-pages.json';
import { EcosystemMenu } from './ecosystem-menu';
import { MobileEcosystemMenu } from './mobile-ecosystem-menu';
import { QwikPlusLogo } from './qwik-plus-logo';

const getRandomSites = (sites: typeof SHOWCASE) => {
  return sites
    .filter((site) => site.perf.score >= 0.9)
    .sort(() => (Math.random() > 0.5 ? 1 : -1))
    .slice(0, 6);
};

export default component$(() => {
  useStyles$(styles);

  const mediaFilter = (item: MediaEntry) => item?.promoted;

  const courses = MEDIA.courses.filter(mediaFilter);
  const videos = MEDIA.videos.filter(mediaFilter);
  const podcasts = MEDIA.podcasts.filter(mediaFilter);
  const presentations = MEDIA.presentations.filter(mediaFilter);
  const showcaseSites = getRandomSites(SHOWCASE);

  return (
    <>
      <div class="ecosystem lg:grid grid-cols-[240px,1fr] m-auto max-w-screen-xl gap-8 custom-grid-cols-240px-1fr-tailwind-workaround">
        <EcosystemMenu />
        <MobileEcosystemMenu />

        <article class="px-6">
          <QwikPlusLogo />

          <div class="purple-gradient" role="presentation" />
          <div class="blue-gradient" role="presentation" />

          <section class="scroll-m-20 lg:scroll-m-24" id="deployments">
            <h2>
              <Link href="/docs/deployments/">Deployments</Link>
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
              <AddIntegrationItem
                title="Add A Deployment"
                href="/docs/deployments/#add-a-new-deployment"
              />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="integrations">
            <h2>
              <span>
                <Link href="/docs/integrations/">Integrations</Link>
              </span>
              <span>
                <Link href="/docs/integrations/" class="text-sm">
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
              <AddIntegrationItem
                title="Add An Integration"
                href="/docs/integrations/#add-a-new-integration"
              />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="libraries">
            <h2>
              <span>Libraries</span>
              <span></span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {data.libraries.map((item, i) => (
                <LibraryGridItem
                  title={item.title}
                  href={item.github}
                  imgSrc={item.imgSrc}
                  width={item.width || 90}
                  height={item.height || 90}
                  description={item.description}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
              <AddIntegrationItem title="Add A Library" href="/docs/advanced/library/" />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24">
            <h2>Newsletter</h2>
            <a href="https://qwiknewsletter.com" target="_blank">
              <div class="flex flex-col items-center gap-8">
                <div
                  class="flex justify-center p-4 w-full bg-[--qwik-dark-purple]
        bg-gradient-to-r from-[--qwik-dark-purple-bg] via-purple-500 to-[--qwik-dark-purple-bg]"
                >
                  <ImgQwikNewsletter />
                </div>
                <div class="text-2xl font-bold">Qwikly Newsletter - Weekly news about Qwik</div>
              </div>
            </a>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="courses">
            <h2>
              <span>
                <Link href="/media/#courses">Courses</Link>
              </span>
              <span>
                <Link href="/media/#courses" class="text-sm">
                  See All
                </Link>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {courses.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  imgCover={true}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
              <AddIntegrationItem
                title="Add A Course"
                href="https://github.com/QwikDev/qwik/blob/main/packages/docs/src/routes/(ecosystem)/media/index.tsx"
              />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="videos">
            <h2>
              <span>
                <Link href="/media/#videos">Videos</Link>
              </span>
              <span>
                <a
                  href="https://youtube.com/playlist?list=PLq_6N4Z1G7mSAh_v9jfVUcu_R1vOM5Nob&si=46Ko4cy1sCUzJFJJ"
                  class="text-sm"
                >
                  See All
                </a>
              </span>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {videos.map((item, i) => (
                <GridItem
                  title={item.title}
                  href={item.href}
                  imgSrc={item.imgSrc}
                  imgCover={true}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="podcasts">
            <h2>
              <span>
                <Link href="/media/#podcasts">Podcasts</Link>
              </span>
              <span>
                <Link href="/media/#podcasts" class="text-sm">
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
                  imgCover={true}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
              <AddIntegrationItem
                title="Add A Podcast"
                href="https://github.com/QwikDev/qwik/blob/main/packages/docs/src/routes/(ecosystem)/media/index.tsx"
              />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="showcase">
            <h2>
              <span>
                <Link href="/showcase/">Showcase</Link>
              </span>
              <span>
                <Link href="/showcase/" class="text-sm">
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
                  imgCover={true}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
              <AddIntegrationItem
                title="Add A Showcase"
                href="https://github.com/QwikDev/qwik/edit/main/packages/docs/scripts/pages.json"
              />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="presentations">
            <h2>
              <span>
                <Link href="/media/#presentations">Presentations</Link>
              </span>
              <span>
                <Link href="/media/#presentations" class="text-sm">
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
                  imgCover={true}
                  key={i}
                  thumbnailBg={true}
                />
              ))}
              <AddIntegrationItem
                title="Add A Presentation"
                href="https://github.com/QwikDev/qwik/blob/main/packages/docs/src/routes/(ecosystem)/media/index.tsx"
              />
            </ul>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="community">
            <h2>
              <Link href="/community/groups/">Community</Link>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-4">
              {data.communities.map((item, i) => (
                <GridItem title={item.title} href={item.href} imgSrc={item.imgSrc} key={i} />
              ))}
            </ul>

            <aside class="mt-6 text-center">
              <p>Interested in starting a local Qwik community as well?</p>
              <p>
                <a
                  class="text-blue-600 font-bold"
                  href="https://forms.gle/S1rxiKiVdhZqkk8RA"
                  target="_blank"
                >
                  Please apply here
                </a>{' '}
                for the Qwik Community Leaders program
              </p>
            </aside>
          </section>

          <section class="scroll-m-20 lg:scroll-m-24" id="social">
            <h2>
              <Link href="/community/groups/">Social</Link>
            </h2>
            <ul class="grid gap-8 grid-cols-2 md:grid-cols-3">
              {data.social.map((item, i) => (
                <GridItem title={item.title} href={item.href} imgSrc={item.imgSrc} key={i} />
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

export const GridItem: FunctionComponent<GridItemProps> = (props) => {
  return (
    <li class="grid-item">
      <Link href={props.href}>
        <div class={{ thumbnail: props.thumbnailBg, cover: props.imgCover }}>
          <img src={props.imgSrc} alt={props.title} width="250" height="120" loading="lazy" />
        </div>
        <div class="text">{props.title}</div>
      </Link>
    </li>
  );
};

export const LibraryGridItem: FunctionComponent<LibraryGridItemProps> = (props) => {
  return (
    <li class="grid-item">
      <Link href={props.href}>
        <div class={{ thumbnail: props.thumbnailBg, cover: props.imgCover }}>
          <img
            src={props.imgSrc}
            alt={props.title}
            width={props.width || 90}
            height={props.height || 90}
            loading="lazy"
          />
        </div>
        <div class="text">{props.title}</div>
        <div class="description">{props.description}</div>
      </Link>
    </li>
  );
};

export const AddIntegrationItem: FunctionComponent<GridItemProps> = (props) => {
  return (
    <li class="grid-item add-integration">
      <Link href={props.href}>
        <div class="thumbnail">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 64 64">
            <path fill="currentColor" d="M38 26V2H26v24H2v12h24v24h12V38h24V26z" />
          </svg>
        </div>
        <div class="text">{props.title}</div>
      </Link>
    </li>
  );
};

interface GridItemProps {
  title: string;
  href: string;
  imgSrc?: string;
  imgCover?: boolean;
  thumbnailBg?: boolean;
}

interface LibraryGridItemProps {
  title: string;
  href: string;
  description: string;
  imgSrc?: string;
  width?: number;
  height?: number;
  imgCover?: boolean;
  thumbnailBg: boolean;
}
