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
    <div class="bg-grid-stars">
      <div
        class="absolute -z-2 left-1/2 top-1/2 -translate-x-[90%] -translate-y-[90%]
          w-[250vw] h-[200vw] bg-hero-gradient-blue
          2xl:w-[1600px] 2xl:h-[1200px] 2xl:-translate-x-[110%]"
      />
      <Header />
      {/* blue gradient — centered on section, shifted left */}
      <main class="flex fixed-header">
        <div class="flex flex-wrap max-w-[1280px] mt-16 mb-20 mx-auto">
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
