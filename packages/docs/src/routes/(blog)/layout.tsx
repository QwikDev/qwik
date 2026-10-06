import { $, component$, Slot, useStyles$ } from '@qwik.dev/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { type DocumentHead, type RequestHandler } from '@qwik.dev/router';
import { useImageProvider, type ImageTransformerProps } from 'qwik-image';
import docsStyles from '../docs/docs.css?inline';
import GridStarBackground from '~/media/decor/grid-star-bg.svg?jsx';
import { blogArticles } from './data';

export const onRequest: RequestHandler = async (request) => {
  request.cacheControl(600);
};

// Runs after the article's frontmatter, so an explicit `og:image` wins.
export const head: DocumentHead = ({ head, url }) => {
  const hasSocialImage = head.meta.some((meta) => meta.property === 'og:image');
  const article = blogArticles.find(({ path }) => path === url.pathname);
  if (hasSocialImage || !article) {
    return {};
  }
  return {
    meta: [
      { property: 'og:image', content: article.image },
      { property: 'og:image:alt', content: article.title },
    ],
  };
};

export default component$(() => {
  useStyles$(docsStyles);
  useStyles$(`
    .docs article p {
      font-size: 18px;
    }

    #qwik-image-warning-container {
      display: none;
    }`);

  useImageProvider({
    imageTransformer$: $(({ src }: ImageTransformerProps): string => src),
  });

  return (
    <div class="bg-grid-stars">
      <GridStarBackground class="grid-star-background" />
      <div
        class="absolute -z-2 left-1/2 top-[50vh] -translate-x-[90%] -translate-y-[90%]
          w-[250vw] h-[200vw] bg-hero-gradient-blue
          2xl:w-[1600px] 2xl:h-[1200px] 2xl:-translate-x-[110%]"
      />
      <Header />
      {/* blue gradient — centered on section, shifted left */}
      <main class="flex fixed-header">
        <div class="flex flex-wrap min-w-0 max-w-[1280px] mt-16 mb-20 mx-auto">
          <div class="w-full px-10 xl:px-0">
            <Slot />
          </div>
        </div>
      </main>
      <div class="px-4">
        <Footer />
      </div>
    </div>
  );
});
