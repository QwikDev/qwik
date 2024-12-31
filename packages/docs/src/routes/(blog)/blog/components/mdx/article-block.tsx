import { component$, Slot } from '@builder.io/qwik';
import { ArticleHero } from './article-hero';
import { useDocumentHead, useLocation } from '@builder.io/qwik-city';
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
