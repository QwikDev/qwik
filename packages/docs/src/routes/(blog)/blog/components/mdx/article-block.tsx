import { component$, Slot } from "@builder.io/qwik";
import { useDocumentHead, useLocation } from "@builder.io/qwik-city";
import { authors, blogArticles } from "~/routes/(blog)/data";
import { ArticleHero } from "./article-hero";

type Props = { authorLink: string };

export const ArticleBlock = component$<Props>(({ authorLink }) => {
  const location = useLocation();
  const { frontmatter } = useDocumentHead();
  const article = blogArticles.find(({ path }) => path === location.url.pathname);
  const authorLinks = frontmatter.authors.map((author: string) => authors[author].socialLink);

  return (
    <div class="docs">
      <ArticleHero image={article?.image || ""} authorLinks={authorLinks} />
      <article class="max-w-[900px] mx-auto">
        <Slot />
      </article>
    </div>
  );
});
