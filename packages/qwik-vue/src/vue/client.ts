import { NoSerialize, noSerialize, QRL, Signal } from '@builder.io/qwik';
import { createVueApp } from './createApp';
import type { Internal, VueProps } from './types';
// @ts-ignore
import { setup } from 'virtual:@qwik/vue/app';
import { clientOnlySlots, serverSlots } from './slots';
import type { Component } from 'vue';

export async function mountApp(
  vueCmpQrl: QRL<Component>,
  props: VueProps,
  isHydration: boolean,
  hostRef: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  internalState: Signal<NoSerialize<Internal<VueProps>>>
) {
  const element = hostRef.value;
  if (element) {
    const vueCmp = await vueCmpQrl.resolve();

    // Dynamic slots are used when the app is not rendered on the server (client-side only)
    const slots = isHydration ? serverSlots() : clientOnlySlots(slotRef);
    const { app, updateProps } = createVueApp(vueCmp, props, slots, isHydration);

    setup(app);
    app.mount(element, isHydration);

    internalState.value = noSerialize({
      app,
      updateProps,
    });
  }
}
