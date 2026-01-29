import { $, useOn, useOnDocument, useSignal } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik';
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
  return mainExactProps(slotEl, scopeId, RootCmp, newProps);
}

export function mainExactProps(
  slotEl: Element | undefined,
  scopeId: string,
  RootCmp: any,
  props: any
) {
  return createElement(SlotCtx.Provider, {
    value: {
      el: slotEl,
      scopeId,
      attachedEl: undefined,
    },
    children: createElement(RootCmp, {
      ...props,
      children: createElement(SlotElement, null),
    }),
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

export const getReactProps = (props: Record<string, any>): Record<string, any> => {
  const obj: Record<string, any> = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith('client:') && !key.startsWith('qwik:') && !key.startsWith(HOST_PREFIX)) {
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
  const signal = useSignal(false);
  const activate = $(() => (signal.value = true));
  const clientOnly = !!(props['client:only'] || props['qwik:only'] || opts?.clientOnly);

  /*
    qwik:* is an alias so that it can be used in meta-frameworks that also use client:* directives.
  */
  const clientVisible =
    props['client:visible'] || props['qwik:visible'] || opts?.eagerness === 'visible';

  const clientIdle = props['client:idle'] || props['qwik:idle'] || opts?.eagerness === 'idle';

  const clientLoad =
    props['client:load'] || props['qwik:load'] || clientOnly || opts?.eagerness === 'load';

  const clientHover = props['client:hover'] || props['qwik:hover'] || opts?.eagerness === 'hover';

  const clientEvent = props['client:event'] || props['qwik:event'];

  if (isServer) {
    if (clientVisible) {
      useOn('qvisible', activate);
    }
    if (clientIdle) {
      useOnDocument('qidle', activate);
    }
    if (clientLoad) {
      useOnDocument('qinit', activate);
    }
    if (clientHover) {
      useOn('mouseover', activate);
    }
    if (clientEvent) {
      useOn(clientEvent, activate);
    }
    if (opts?.event) {
      useOn(opts?.event, activate);
    }
  }
  return [signal, clientOnly, activate] as const;
};

const HOST_PREFIX = 'host:';
