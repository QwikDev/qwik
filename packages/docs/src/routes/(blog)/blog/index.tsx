import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { FeaturedArticle } from './components/featured-article';
import { ArticlesGrid } from './components/articles-grid';

export default component$(() => {
  return (
    <div>
      <h1 class="text-h4 font-heading mb-10">Blog</h1>
      <section class="pb-16">
        <FeaturedArticle />
      </section>
      <section>
        <h2 class="pb-10 text-h5 font-heading">Latest Articles</h2>
        <ArticlesGrid />
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Blog',
};
