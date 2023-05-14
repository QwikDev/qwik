import { component$, useContext, useSignal, useStyles$ } from '@builder.io/qwik';
import styles from '../store.css?inline';
import { STORE_CONTEXT, fetchFromShopify } from '../utils';
import type { DocumentHead } from '@builder.io/qwik-city';
import type { ProductType } from '../types';
import { addLineItemMutation } from '../mutation';

export default component$(() => {
  useStyles$(styles);
  const appStore = useContext(STORE_CONTEXT);

  return (
    <div class="store">
      <article>
        <div class="purple-gradient" role="presentation" />
        <div class="blue-gradient" role="presentation" />
        <div class="flex flex-wrap">
          {(appStore.products || []).map((product: any) => (
            <Product product={product} />
          ))}
        </div>
      </article>
    </div>
  );
});

type Props = {
  product: ProductType;
};

export const Product = component$<Props>(({ product }) => {
  const appStore = useContext(STORE_CONTEXT);
  const showProductSignal = useSignal(true);
  const selectedVariantId = useSignal(product.variants.find((v) => v.available)?.id || '');
  return (
    <div class="product">
      <h5 class="title">{product.title}</h5>
      <div class={`info ${showProductSignal.value ? 'overflow-hidden' : 'overflow-auto'}`}>
        {showProductSignal.value ? (
          <img
            class="object-contain"
            width="300"
            height="300"
            src={product.image.src}
            alt="product image"
          />
        ) : (
          <div dangerouslySetInnerHTML={product.body_html} />
        )}
      </div>
      <div class="py-2 px-5 flex items-center">
        <span
          class="font-medium hover:underline text-black"
          onClick$={() => {
            showProductSignal.value = !showProductSignal.value;
          }}
        >
          {showProductSignal.value ? 'Description' : 'Image'}
        </span>
      </div>
      <div class="pb-6 px-5">
        <div class="flex flex-end items-center justify-between pb-4">
          {product.variants.length > 1 ? (
            <select
              class="select"
              onChange$={(event) => {
                selectedVariantId.value = event.target.value;
              }}
            >
              {product.variants.map((variant) => (
                <option
                  key={variant.id}
                  selected={selectedVariantId.value === variant.id}
                  disabled={!variant.available}
                  value={variant.id}
                >
                  {variant.title}
                </option>
              ))}
            </select>
          ) : (
            <div />
          )}
          <span class="text-3xl font-bold text-slate-900 py-2">
            ${product.variants[0].price.amount}
          </span>
        </div>
        <div class="flex">
          <button
            class="button_primary"
            onClick$={async () => {
              const response = await fetchFromShopify(
                addLineItemMutation(appStore.cart.id, selectedVariantId.value)
              );
              const {
                data: { checkoutLineItemsAdd },
              } = await response.json();
              appStore.cart = checkoutLineItemsAdd.checkout;
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-2 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Store',
};
