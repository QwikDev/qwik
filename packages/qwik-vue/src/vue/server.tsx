import { QRL, Signal, SSRRaw, Slot } from '@builder.io/qwik';
import { createVueApp } from './createApp';
import type { QwikifyOptions, VueProps } from './types';
// @ts-ignore
import { setup } from 'virtual:@qwik/vue/app';
import { renderToString } from 'vue/server-renderer';
import { serverSlots, MARKUP_SLOT } from './slots';
import { getAttrs, getHostProps } from './vue.utils';

export const serverRenderVueQrl = async (
  vueCmpQrl: QRL<any>,
  props: VueProps,
  opts: QwikifyOptions = {},
  hostRef: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  isClientOnly: boolean
) => {
  const TagName = opts.tagName ?? ('qwik-vue' as any);

  const vueCmp = await vueCmpQrl.resolve();

  const { app } = createVueApp(vueCmp, getAttrs(props), serverSlots(), true);

  setup(app);

  if (isClientOnly) {
    return (
      <TagName {...getHostProps(props)} ref={hostRef}>
        <q-slot ref={slotRef} hidden aria-hidden="true" style="display: none">
          <Slot />
        </q-slot>
      </TagName>
    );
  }

  const html = await renderToString(app);
  const startSlotComment = html.indexOf(MARKUP_SLOT);

  if (startSlotComment >= 0) {
    // Slot found
    const beforeSlot = html.slice(0, startSlotComment);
    const afterSlot = html.slice(startSlotComment + MARKUP_SLOT.length);
    return (
      <TagName {...getHostProps(props)} ref={hostRef}>
        <SSRRaw data={beforeSlot} />
        <q-slot ref={slotRef}>
          <Slot />
        </q-slot>
        <SSRRaw data={afterSlot} />
      </TagName>
    );
  }
  return (
    <TagName ref={hostRef}>
      <SSRRaw data={html} />
    </TagName>
  );
};
