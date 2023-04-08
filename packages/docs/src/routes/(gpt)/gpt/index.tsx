import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { Link } from '@builder.io/qwik-city';
import styles from '../ecosystem.css?inline';
import { QwikPlusLogo } from './qwik-plus-logo';
import QwikGpt from '../../../components/qwik-gpt';

export default component$(() => {
  useStyles$(styles);
  return (
    <>
      <div class="ecosystem flex justify-center px-6 m-auto max-w-screen-xl gap-8">
        <article class="w-full">
          <QwikPlusLogo />
          <QwikGpt></QwikGpt>
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
        <div class={{ thumbnail: props.thumbnailBg, cover: props.imgCover }}>
          <img src={props.imgSrc} alt={props.title} loading="lazy" />
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
  thumbnailBg: boolean;
}
