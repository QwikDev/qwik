import { component$, Slot, useContextProvider, useStore } from '@builder.io/qwik';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { routeLoader$ } from '@builder.io/qwik-city';
import { fetchFromShopify, mapProducts, STORE_CONTEXT } from './utils';
import { productQuery } from './query';

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
