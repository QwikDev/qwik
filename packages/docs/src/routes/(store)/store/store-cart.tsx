import { component$, useComputed$, useContext } from '@builder.io/qwik';
import { STORE_CONTEXT } from '../utils';

export const StoreCart = component$(() => {
  const appStore = useContext(STORE_CONTEXT);
  const totalQuantitySignal = useComputed$(() =>
    appStore.cart
      ? appStore.cart.lineItems.edges.reduce(
          (quantity: number, { node }: any) => quantity + node.quantity,
          0
        )
      : 0
  );
  return (
    <div class="flex justify-end my-3 pr-4 text-slate-900 w-full absolute z-10">
      {appStore.cart && (
        <button
          class="flex space-x-2 bg-gray-100 shadow-xl justify-center items-center border w-40 rounded-md space-x-5"
          type="button"
          aria-expanded="false"
          onClick$={() => {
            if (appStore.cart.webUrl) {
              window.open(appStore.cart.webUrl);
            }
          }}
        >
          <div class="flex h-12 justify-center items-center space-x-2">
            <svg
              viewBox="0 0 20 20"
              class="w-7 text-slate-900 text-solid-medium"
              style="fill: currentcolor; stroke: none;"
            >
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"></path>
            </svg>
            <div>Cart</div>
            <div class="inline-flex items-center justify-center w-8 h-8 text-sm font-semibold text-white bg-slate-900 rounded-full">
              {totalQuantitySignal.value}
            </div>
          </div>
        </button>
      )}
    </div>
  );
});
