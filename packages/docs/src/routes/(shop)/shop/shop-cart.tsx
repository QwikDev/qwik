import { $, component$, useComputed$, useContext, useSignal } from '@builder.io/qwik';
import { COOKIE_CART_ID_KEY, SHOP_CONTEXT, deleteCookie, formatPrice } from '../utils';
import { ShopCartRows } from './shop-cart-rows';

export const ShopCart = component$(() => {
  const showCartSignal = useSignal(false);
  const appShop = useContext(SHOP_CONTEXT);
  const isEmptySignal = useComputed$(
    () => appShop.cart?.lineItems?.edges?.length || 0 > 0 || false
  );
  const totalQuantitySignal = useComputed$(() =>
    appShop.cart
      ? appShop.cart.lineItems.edges.reduce(
          (quantity: number, { node }) => quantity + node.quantity,
          0
        )
      : 0
  );
  return (
    <>
      {appShop.cart && (
        <div class="cart">
          <button
            name="Cart"
            aria-label={`${totalQuantitySignal.value} items in cart`}
            class="relative flex border-2 border-slate-600 rounded-xl p-3 text-[color:var(--text-color)] bg-[color:var(--bg-color)]"
            onClick$={() => {
              showCartSignal.value = true;
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              style="margin: auto"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <span class="px-2">Cart</span>
            {totalQuantitySignal.value > 0 && (
              <div class="absolute rounded-full -top-4 -right-4 border-2 border-gray-300 w-8 h-8 pt-0.5 -pl-0.5 text-[color:var(--text-color)] bg-[color:var(--bg-color)]">
                {totalQuantitySignal.value}
              </div>
            )}
          </button>
          {showCartSignal.value && (
            <div class="fixed inset-0 overflow-hidden z-[100]">
              <div class="absolute inset-0 overflow-hidden">
                <div class="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity opacity-100"></div>
                <div class="fixed inset-y-0 right-0 pl-10 max-w-full flex">
                  <div class="w-screen max-w-md translate-x-0">
                    <div class="h-full flex flex-col text-[color:var(--text-color)] bg-[color:var(--bg-color)] shadow-xl overflow-y-scroll">
                      <div class="flex-1 py-6 overflow-y-auto px-4 sm:px-6">
                        <div class="flex items-start justify-between">
                          <h2 class="text-lg font-medium">Shopping cart</h2>
                          <div class="ml-3 h-7 flex items-center">
                            <button
                              type="button"
                              class="-m-2 p-2"
                              onClick$={() => (showCartSignal.value = !showCartSignal.value)}
                            >
                              <span class="sr-only">Close panel</span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
                                class="h-6 w-6"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M6 18L18 6M6 6l12 12"
                                ></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div class="mt-8">
                          {isEmptySignal.value ? (
                            <ShopCartRows />
                          ) : (
                            <div class="flex items-center justify-center h-48 text-xl">
                              🛒 Your cart is empty
                            </div>
                          )}
                        </div>
                      </div>
                      {isEmptySignal.value && (
                        <div class="border-t border-gray-200 py-6 px-4 sm:px-6">
                          <div class="flex justify-between text-base font-medium">
                            <p>Subtotal</p>
                            <p>
                              {formatPrice(
                                parseFloat(appShop.cart.totalPrice.amount),
                                appShop.cart.totalPrice.currencyCode
                              )}
                            </p>
                          </div>
                          <p class="mt-0.5 text-sm">🚛 Shipping will be calculated at checkout.</p>
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            href={appShop.cart.webUrl}
                            class="button_primary mt-6"
                            onClick$={$(() => {
                              deleteCookie(COOKIE_CART_ID_KEY);
                            })}
                          >
                            Checkout
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
});
