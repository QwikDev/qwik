import { createSSRApp, createApp, Component, h } from 'vue';
import type { VueProps } from './types';
import { getAttrs } from './vue.utils';

export function createVueApp(
  Cmp: Component,
  props: VueProps,
  slots: Record<string, Component>,
  ssr: boolean
) {
  const formattedBindAttributes = getAttrs(props);

  const app = (ssr ? createSSRApp : createApp)({
    setup() {
      return () => h(Cmp, formattedBindAttributes, slots);
    },
  });

  const updateProps = (newProps: VueProps) => {
    Object.assign(formattedBindAttributes, getAttrs(newProps));
  };

  return { app, updateProps };
}
