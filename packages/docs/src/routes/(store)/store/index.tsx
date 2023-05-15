import { component$, useContext, useStyles$ } from '@builder.io/qwik';
import styles from '../store.css?inline';
import { STORE_CONTEXT } from '../utils';
import type { DocumentHead } from '@builder.io/qwik-city';
import { StoreIcon } from './store';
import { Product } from './product';

export default component$(() => {
  useStyles$(styles);
  const appStore = useContext(STORE_CONTEXT);

  return (
    <div class="store">
      <StoreIcon class="mx-auto my-10" />
      <article>
        <div class="purple-gradient" role="presentation" />
        <div class="blue-gradient" role="presentation" />
        <div class="flex flex-wrap gap-9 justify-center max-w-[1200px] mb-20 mx-auto">
          {(appStore.products || []).map((product: any) => (
            <Product product={product} />
          ))}
        </div>
      </article>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Store',
};
