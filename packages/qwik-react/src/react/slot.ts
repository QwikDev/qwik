import { $, useOn, useOnDocument, useSignal } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import { Component, createContext, createElement, createRef } from 'react';
import type { QwikifyOptions, QwikifyProps } from './types';

interface SlotState {
  el?: Element;
  scopeId: string;
  attachedEl?: Element;
}
const SlotCtx = createContext<SlotState>({ scopeId: '' });

export function main(slotEl: Element | undefined, scopeId: string, RootCmp: any, props: any) {
  const newProps = getReactProps(props);
  newProps.children = createElement(SlotElement, null);
  return createElement(SlotCtx.Provider, {
    value: {
      el: slotEl,
      scopeId,
      attachedEl: undefined,
    },
    children: createElement(RootCmp, newProps),
  });
}

export class SlotElement extends Component {
  static contextType = SlotCtx;
  declare context: React.ContextType<typeof SlotCtx>;

  slotC = createRef<Element>();

  shouldComponentUpdate(): boolean {
    return false;
  }

  componentDidMount(): void {
    const slotC = this.slotC.current;
    if (slotC) {
      const { attachedEl, el } = this.context;
      if (el) {
        if (!attachedEl) {
          slotC.appendChild(el);
        } else if (attachedEl !== slotC) {
          throw new Error('already attached');
        }
      }
    }
  }

  render() {
    return createElement('q-slotc', {
      class: this.context.scopeId,
      suppressHydrationWarning: true,
      dangerouslySetInnerHTML: { __html: '<!--SLOT-->' },
      ref: this.slotC,
    });
  }
}

export const clientProps = (props: Record<string, any>): Record<string, any> => {
  const obj = getReactProps(props);
  obj.children = createElement('qwik-slot', {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: '' },
  });
  return obj;
};

const getReactProps = (props: Record<string, any>): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith('client:') && !key.startsWith(HOST_PREFIX)) {
      const normalizedKey = key.endsWith('$') ? key.slice(0, -1) : key;
      obj[normalizedKey] = props[key];
    }
  });
  return obj;
};

export const getHostProps = (props: Record<string, any>): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (key.startsWith(HOST_PREFIX)) {
      obj[key.slice(HOST_PREFIX.length)] = props[key];
    }
  });
  return obj;
};

export const useWakeupSignal = (props: QwikifyProps<{}>, opts: QwikifyOptions = {}) => {
  const signal = useSignal<boolean>();
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

const HOST_PREFIX = 'host:';
