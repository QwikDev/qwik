import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useThirdPartyPaymentLoader = routeLoader$(() => {
  return { name: 'John Doe' };
});

export const ThirdPartyPaymentComponent = component$(() => {
  const thirdPartyPaymentLoader = useThirdPartyPaymentLoader();
  return (
    <div
      class={[
        'relative m-auto h-56 w-96 rounded-xl font-bold text-white shadow-2xl',
        'transform bg-gray-600 transition-transform hover:scale-110',
      ]}
    >
      <div class="absolute top-8 w-full px-8">
        <div class="flex justify-between">
          <div class="">
            <p>Name</p>
            <p class="tracking-widest">{thirdPartyPaymentLoader.value.name}</p>
          </div>
          <img class="h-12 w-12" src="/logos/qwik-logo.svg" />
        </div>
        <div class="pt-1">
          <p class="font-medium">Card Number</p>
          <p class="tracking-wider">4642 3489 9867 7632</p>
        </div>
        <div class="pt-6 pr-6">
          <div class="flex justify-between text-xs">
            <div>
              <p class="font-medium">Valid</p>
              <p class="tracking-wider">11/15</p>
            </div>
            <div>
              <p class="font-medium">Expiry</p>
              <p class="tracking-wider">03/25</p>
            </div>
            <div>
              <p class="font-medium">CVV</p>
              <p class="tracking-wider">···</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
