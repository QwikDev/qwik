import {
  $,
  component$,
  Slot,
  useContextProvider,
  useStore,
  useVisibleTask$,
} from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { routeLoader$ } from '@builder.io/qwik-city';
import {
  COOKIE_CART_ID_KEY,
  fetchFromShopify,
  getCookie,
  mapProducts,
  setCookie,
  SHOP_CONTEXT,
} from './utils';
import { checkoutQuery, productsQuery } from './query';
import { checkoutCreateMutation } from './mutation';
import { useImageProvider, type ImageTransformerProps } from 'qwik-image';
import type { CheckoutQuery, ProductsQuery, CheckoutCreateMutation, ShopApp } from './types';

const useProductsLoader = routeLoader$(async () => {
  const response = await fetchFromShopify(productsQuery());
  const {
    data: { node },
  }: ProductsQuery = await response.json();
  return mapProducts(node.products.edges);
});

export default component$(() => {
  useImageProvider({ imageTransformer$: $(({ src }: ImageTransformerProps): string => src) });
  const appShop = useStore<ShopApp>({ products: useProductsLoader().value });
  useContextProvider(SHOP_CONTEXT, appShop);

  useVisibleTask$(async () => {
    const cartId = getCookie(COOKIE_CART_ID_KEY);
    const body = cartId ? checkoutQuery(cartId) : checkoutCreateMutation();
    const response = await fetchFromShopify(body);
    const { data }: CheckoutQuery | CheckoutCreateMutation = await response.json();

    appShop.cart = 'node' in data ? data.node : data.checkoutCreate.checkout;

    if (!cartId && appShop.cart?.id) {
      setCookie(COOKIE_CART_ID_KEY, appShop.cart.id, 30);
    }
  });

  return (
    <>
      <Header />
      <main>
        <Slot />
      </main>
      <div class="px-4">
        <Footer />
      </div>
    </>
  );
});
