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
  STORE_CONTEXT,
} from './utils';
import { cartQuery, productQuery } from './query';
import { createCartMutation } from './mutation';
import { useImageProvider, type ImageTransformerProps } from 'qwik-image';

const useProductsLoader = routeLoader$(async () => {
  const response = await fetchFromShopify(productQuery());
  const {
    data: { node },
  } = await response.json();
  return mapProducts(node.products.edges);
});

export default component$(() => {
  useImageProvider({
    imageTransformer$: $(({ src }: ImageTransformerProps): string => src),
  });
  const appStore = useStore<{ products?: any; cart?: any }>({
    products: useProductsLoader().value,
  });
  useContextProvider(STORE_CONTEXT, appStore);

  useVisibleTask$(async () => {
    const cartId = getCookie(COOKIE_CART_ID_KEY);
    const body = cartId ? cartQuery(cartId) : createCartMutation();
    const response = await fetchFromShopify(body);
    const { data } = await response.json();
    appStore.cart = cartId ? data.node : data.checkoutCreate.checkout;

    if (!cartId) {
      setCookie(COOKIE_CART_ID_KEY, appStore.cart.id, 30);
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
