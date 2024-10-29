import { component$, useContext, useStyles$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import styles from '../shop.css?inline';
import { SHOP_CONTEXT } from '../utils';
import { ShopHeader } from './shop-header';
import { ShopProduct } from './shop-product';

export default component$(() => {
  useStyles$(styles);
  const appShop = useContext(SHOP_CONTEXT);

  return (
    <div class="shop">
      <ShopHeader />
      <article>
        <div class="purple-gradient" role="presentation" />
        <div class="blue-gradient" role="presentation" />
        <div class="flex flex-wrap gap-9 justify-center max-w-[1200px] mb-20 mx-auto">
          {(appShop.products || []).map((product, key) => (
            <ShopProduct key={key} product={product} />
          ))}
        </div>
      </article>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Shop',
};
