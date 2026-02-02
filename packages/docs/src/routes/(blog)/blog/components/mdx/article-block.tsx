import { component$, Slot } from '@qwik.dev/core';
import { useDocumentHead, useLocation } from '@qwik.dev/router';
import { authors, blogArticles } from '~/routes/(blog)/data';
import { ArticleHero } from './article-hero';

type Props = { authorLink: string };

export const ArticleBlock = component$<Props>(({ authorLink }) => {
  const location = useLocation();
  const { frontmatter } = useDocumentHead();
  const article = blogArticles.find(({ path }) => path === location.url.pathname);
  const authorLinks = frontmatter.authors.map((author: string) => authors[author].socialLink);

  return (
    <div class="docs">
      <ArticleHero image={article?.image || ''} authorLinks={authorLinks} />
      <article class="max-w-[900px] mx-auto">
        <Slot />
      </article>
    </div>
  );
});
