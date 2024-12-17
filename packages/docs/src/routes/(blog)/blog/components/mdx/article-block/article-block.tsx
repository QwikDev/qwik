import { component$, Slot } from '@builder.io/qwik';
import { ArticleHero } from '../article-hero/article-hero';

type Props = { imageSrc: string; authorLink: string };

export const ArticleBlock = component$<Props>(({ imageSrc, authorLink }) => {
  return (
    <div class="docs">
      <ArticleHero imageSrc={imageSrc} authorLink={authorLink} />
      <article>
        <Slot />
      </article>
    </div>
  );
});
