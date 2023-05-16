import { component$, useContext, useStyles$ } from '@builder.io/qwik';
import styles from '../shop.css?inline';
import { SHOP_CONTEXT } from '../utils';
import type { DocumentHead } from '@builder.io/qwik-city';
import { ShopIcon } from './shop-icon';
import { ShopProduct } from './shop-product';
import { ShopCart } from './shop-cart';

export default component$(() => {
  useStyles$(styles);
  const appShop = useContext(SHOP_CONTEXT);

  return (
    <div class="shop">
      <ShopIcon class="mx-auto mt-6 mb-2" />
      <ShopCart />
      <article>
        <div class="purple-gradient" role="presentation" />
        <div class="blue-gradient" role="presentation" />
        <div class="flex flex-wrap gap-9 justify-center max-w-[1200px] mb-20 mx-auto">
          {(appShop.products || []).map((product: any) => (
            <ShopProduct product={product} />
          ))}
        </div>
      </article>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Shop',
};
