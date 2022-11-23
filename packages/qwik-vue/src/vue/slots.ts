import type { Signal } from '@builder.io/qwik';
import { h, onMounted, ref } from 'vue';

export const MARKUP_SLOT = '<!--SLOT-->';
export function serverSlots() {
  return {
    default: () => h('qwik-slot', { innerHTML: MARKUP_SLOT }),
  };
}

const intersectionObserverOptions = {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
};

// This component is used for client:only slots and dev mode (client-side only)
const clientOnlySlot = {
  name: 'qwik-slot',
  props: ['content'],
  setup(props: { content?: Element }) {
    const html = ref(props.content?.innerHTML ?? MARKUP_SLOT);

    onMounted(() => {
      if (props.content) {
        const observer = new MutationObserver(() => {
          html.value = props.content?.innerHTML ?? MARKUP_SLOT;
        });
        observer.observe(props.content, intersectionObserverOptions);
      }
    });

    return () => h('qwik-slot', { innerHTML: html.value });
  },
};

export function clientOnlySlots(slotEl: Signal<Element | undefined>) {
  return {
    default: () => h(clientOnlySlot, { content: slotEl.value }),
  };
}
