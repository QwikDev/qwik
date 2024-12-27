import { $, component$, Slot, useStyles$ } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { type RequestHandler } from '@builder.io/qwik-city';
import { useImageProvider, type ImageTransformerProps } from 'qwik-image';
import docsStyles from '../docs/docs.css?inline';

export const onRequest: RequestHandler = async (request) => {
  request.cacheControl(600);
};

export default component$(() => {
  useStyles$(docsStyles);

  useImageProvider({ imageTransformer$: $(({ src }: ImageTransformerProps): string => src) });

  return (
    <>
      <Header />
      <main>
        <div class="blog">
          <div class="purple-gradient" role="presentation" />
          <div class="blue-gradient" role="presentation" />
          <div class="flex flex-wrap gap-9 max-w-[1200px] mb-20 mx-auto">
            <div class="w-full">
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
