import {
  component$,
  Slot,
  useContextProvider,
  useSignal,
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

const useProductsLoader = routeLoader$(async () => {
  const response = await fetchFromShopify(productQuery());
  const {
    data: { node },
  } = await response.json();
  return mapProducts(node.products.edges);
});

export default component$(() => {
  const appStore = useStore<{ products?: any; cart?: any }>({
    products: useProductsLoader().value,
  });
  useContextProvider(STORE_CONTEXT, appStore);

  useVisibleTask$(async () => {
    const cartId = getCookie(COOKIE_CART_ID_KEY);
    const body = cartId ? cartQuery(cartId) : createCartMutation();
    let response = await fetchFromShopify(body);
    const { data } = await response.json();
    appStore.cart = cartId ? data.node : data.checkoutCreate.checkout;
    console.log('Checkout link ---> ', appStore.cart.webUrl);

    if (!cartId) {
      setCookie(COOKIE_CART_ID_KEY, appStore.cart.id, 30);
    }
  });

  return (
    <>
      <Header />
      <div class="text-white">Checkout link in the console 👀</div>
      <main>
        <Slot />
      </main>
      <div class="px-4">
        <Footer />
      </div>
    </>
  );
});
