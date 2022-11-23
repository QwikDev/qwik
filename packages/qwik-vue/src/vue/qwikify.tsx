import {
  $,
  component$,
  implicit$FirstArg,
  QRL,
  RenderOnce,
  Signal,
  Slot,
  SSRRaw,
  useOn,
  useOnDocument,
  useSignal,
  useWatch$,
} from '@builder.io/qwik';

import { isServer } from '@builder.io/qwik/build';
import type { QwikifyOptions, QwikifyProps, VueProps } from './types';

import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
// @ts-ignore
import { setup } from 'virtual:@qwik/vue/app';

export function qwikifyQrl<PROPS extends VueProps>(vueCmpQrl: QRL<any>) {
  return component$<QwikifyProps<PROPS>>((props) => {
    const hostRef = useSignal<HTMLElement>();

    const [wakeUp] = useWakeupSignal(props);

    useWatch$(async ({ track }) => {
      track(() => wakeUp.value);

      if (isServer) {
        return; // early exit
      }

      // Mount / hydrate Vue
      const element = hostRef.value;
      if (element) {
        const vueCmp = await vueCmpQrl.resolve();
        const slots = {
          default: () => h(StaticHtml, {}),
        };
        const app = createSSRApp({ render: () => h(vueCmp, props, slots) });
        setup(app);
        app.mount(element, true);
      }
    });

    if (isServer) {
      const jsx = renderVueQrl(vueCmpQrl, props, hostRef);
      return <>{jsx}</>;
    }

    return (
      <RenderOnce>
        <div></div>
      </RenderOnce>
    );
  });
}

export const renderVueQrl = async (
  vueCmpQrl: QRL<any>,
  props: VueProps,
  hostRef: Signal<HTMLElement | undefined>
) => {
  const vueCmp = await vueCmpQrl.resolve();

  const slots = {
    default: () => h(StaticHtml, {}),
  };
  const app = createSSRApp({ render: () => h(vueCmp, props, slots) });
  setup(app);

  const html = await renderToString(app);

  const mark = '<!--SLOT-->';
  const startSlotComment = html.indexOf(mark);

  if (startSlotComment >= 0) {
    // Comment found
    const beforeSlot = html.slice(0, startSlotComment);
    const afterSlot = html.slice(startSlotComment + mark.length);
    return (
      <>
        <div ref={hostRef}>
          <SSRRaw data={beforeSlot} />
          <Slot />
          <SSRRaw data={afterSlot} />
        </div>
      </>
    );
  }
  return (
    <div ref={hostRef}>
      <SSRRaw data={html} />
    </div>
  );
};

export const useWakeupSignal = (props: QwikifyProps<{}>, opts: QwikifyOptions = {}) => {
  const signal = useSignal(false);
  const activate = $(() => (signal.value = true));

  const clientOnly = !!(props['client:only'] || opts?.clientOnly);
  if (isServer) {
    if (props['client:visible'] || opts?.eagerness === 'visible') {
      useOn('qvisible', activate);
    }
    if (props['client:idle'] || opts?.eagerness === 'idle') {
      useOnDocument('qidle', activate);
    }
    if (props['client:load'] || clientOnly || opts?.eagerness === 'load') {
      useOnDocument('qinit', activate);
    }
    if (props['client:hover'] || opts?.eagerness === 'hover') {
      useOn('mouseover', activate);
    }
    if (props['client:event']) {
      useOn(props['client:event'], activate);
    }
    if (opts?.event) {
      useOn(opts?.event, activate);
    }
  }
  return [signal, clientOnly] as const;
};

export const StaticHtml = defineComponent({
  setup() {
    return () => h('qwik-slot', { innerHTML: '<!--SLOT-->' });
  },
});

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);
