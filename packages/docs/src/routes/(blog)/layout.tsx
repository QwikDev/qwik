import { $, component$, Slot, useStyles$ } from '@qwik.dev/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { type RequestHandler } from '@qwik.dev/router';
import { useImageProvider, type ImageTransformerProps } from 'qwik-image';
import docsStyles from '../docs/docs.css?inline';

export const onRequest: RequestHandler = async (request) => {
  request.cacheControl(600);
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

  useImageProvider({ imageTransformer$: $(({ src }: ImageTransformerProps): string => src) });

  return (
    <>
      <Header />
      <main>
        <div class="blog">
          <div class="purple-gradient" role="presentation" />
          <div class="blue-gradient" role="presentation" />
          <div class="mx-auto mb-20 flex max-w-[1200px] flex-wrap gap-9">
            <div class="w-full px-10 xl:px-0">
              <Slot />
            </div>
          </div>
        </div>
      </main>
      <div class="px-4">
        <Footer />
      </div>
    </>
  );
});
