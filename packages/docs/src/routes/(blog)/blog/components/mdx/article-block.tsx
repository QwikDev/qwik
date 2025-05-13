import { component$, Slot } from '@qwik.dev/core';
import { ArticleHero } from './article-hero';
import { useDocumentHead, useLocation } from '@qwik.dev/router';
import { authors, blogArticles } from '~/routes/(blog)/data';

type Props = { authorLink: string };

export const ArticleBlock = component$<Props>(({ authorLink }) => {
  const location = useLocation();
  const { frontmatter } = useDocumentHead();
  const article = blogArticles.find(({ path }) => path === location.url.pathname);
  const author = authors[frontmatter.authorName];

  return (
    <div class="docs">
      <ArticleHero image={article?.image || ''} authorLink={author.socialLink || ''} />
      <article class="max-w-[900px] mx-auto tracking-wide">
        <Slot />
      </article>
    </div>
  );
});
