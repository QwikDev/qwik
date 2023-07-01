import { component$, useComputed$, useContext, useSignal } from '@builder.io/qwik';
import { modifyLineItemMutation } from '../mutation';
import { SHOP_CONTEXT, fetchFromShopify, formatPrice } from '../utils';
import type { UIProduct } from '../types';
import { Image } from '@unpic/qwik';

type Props = {
  product: UIProduct;
};

export const ShopProduct = component$<Props>(({ product }) => {
  const appShop = useContext(SHOP_CONTEXT);
  const loadingSignal = useSignal(false);
  const showProductSignal = useSignal(true);
  const selectedVariantId = useSignal(product.variants.find((v) => v.available)?.id || '');
  const selectedVariantSignal = useComputed$(() =>
    product.variants.find((v) => v.id === selectedVariantId.value)
  );
  return (
    <div class="product">
      <h5 class="title font-semibold">{product.title}</h5>
      <div class={`info ${showProductSignal.value ? 'overflow-hidden' : 'overflow-auto'}`}>
        {showProductSignal.value ? (
          <Image
            layout="constrained"
            class="object-contain"
            width={300}
            height={300}
            src={product.image.url}
            alt={product.image.altText}
          />
        ) : (
          <div
            class="text-[color:var(--text-color)]"
            dangerouslySetInnerHTML={product.descriptionHtml}
          />
        )}
      </div>
      <div class="py-2 px-5 flex items-center">
        <span
          class="font-medium hover:underline text-[color:var(--text-color)] cursor-pointer"
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
          <span class="text-3xl font-bold py-2 text-[color:var(--text-color)]">
            {selectedVariantSignal.value
              ? formatPrice(
                  parseFloat(selectedVariantSignal.value.price.amount),
                  selectedVariantSignal.value.price.currencyCode
                )
              : '--'}
          </span>
        </div>
        <div class="flex">
          <button
            class="button_primary"
            disabled={loadingSignal.value}
            onClick$={async () => {
              loadingSignal.value = true;
              const response = await fetchFromShopify(
                modifyLineItemMutation(appShop.cart?.id || '', selectedVariantId.value, 1)
              );
              const {
                data: { checkoutLineItemsAdd },
              } = await response.json();
              appShop.cart = checkoutLineItemsAdd.checkout;
              loadingSignal.value = false;
            }}
          >
            {loadingSignal.value ? (
              <>
                <svg
                  aria-hidden="true"
                  role="status"
                  class="inline w-4 h-4 mr-3 animate-spin"
                  viewBox="0 0 100 101"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                    fill="#1C64F2"
                  />
                </svg>
                Loading...
              </>
            ) : (
              <>
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
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
