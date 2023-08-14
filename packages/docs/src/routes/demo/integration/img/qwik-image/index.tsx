import { $, component$ } from '@builder.io/qwik';
import {
  Image,
  type ImageTransformerProps,
  useImageProvider,
} from 'qwik-image';

export default component$(() => {
  const imageTransformer$ = $(
    ({ src, width, height }: ImageTransformerProps): string => {
      // Here you can set your favorite image loaders service
      return `https://cdn.builder.io/api/v1/${src}?height=${height}&width=${width}&format=webp&fit=fill`;
    }
  );

  // Global Provider (required)
  useImageProvider({
    // You can set this prop to overwrite default values [3840, 1920, 1280, 960, 640]
    resolutions: [640],
    imageTransformer$,
  });

  return (
    <Image
      layout="constrained"
      objectFit="fill"
      width={400}
      height={500}
      alt="Tropical paradise"
      placeholder="#e6e6e6"
      src={
        'image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fe5113e1c02db40e5bac75146fa46386f'
      }
    />
  );
});
