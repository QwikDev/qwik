import { component$ } from '@builder.io/qwik';
import { Image } from '@unpic/qwik';

export default component$(() => {
  return (
    <Image
      src="https://cdn.shopify.com/static/sample-images/bath_grande_crop_center.jpeg"
      layout="constrained"
      width={800}
      height={600}
      alt="A lovely bath"
    />
  );
});
