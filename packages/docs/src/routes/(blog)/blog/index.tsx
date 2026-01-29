import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { FeaturedArticle } from './components/featured-article';
import { ArticlesGrid } from './components/articles-grid';

export default component$(() => {
  useStyles$(`
    .blog .purple-gradient {
      position: fixed;
      pointer-events: none;
      width: 1400px;
      height: 800px;
      top: 100px;
      right: -400px;
      background: radial-gradient(
        57.58% 57.58% at 48.79% 42.42%,
        rgba(24, 180, 244, 0.5) 0%,
        rgba(46, 55, 114, 0) 63.22%
      );
      transform: rotate(5deg);
    }

    .blog .blue-gradient {
      position: fixed;
      pointer-events: none;
      width: 1400px;
      height: 1200px;
      top: 600px;
      left: -200px;
      background: radial-gradient(
        50% 50% at 50% 50%,
        rgba(172, 127, 244, 0.5) 0%,
        rgba(21, 25, 52, 0) 100%
      );
      transform: rotate(-5deg);
    }`);

  return (
    <div class="py-8">
      <section class="pb-8">
        <FeaturedArticle />
      </section>
      <section>
        <h2 class="pb-4 text-2xl font-bold text-[color:var(--text-color)]">Latest Articles</h2>
        <ArticlesGrid />
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Blog',
};
