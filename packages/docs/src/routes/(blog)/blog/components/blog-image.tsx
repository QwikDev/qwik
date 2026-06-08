import { component$ } from '@qwik.dev/core';
import { Image as QwikImage, type ImageProps } from 'qwik-image';

/**
 * Blog body image. Lazy-loads by default so below-the-fold images don't compete with the hero (LCP)
 * for bandwidth. Pass `loading="eager"` to override for any image that is above the fold.
 */
export const Image = component$<ImageProps>((props) => {
  return <QwikImage loading="lazy" {...props} />;
});
