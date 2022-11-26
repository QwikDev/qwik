import { $, useOn, useOnDocument, useSignal } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';
import type { QwikifyOptions, QwikifyProps } from './types';
import { Context, createContext, onMount, useContext } from 'solid-js';
import {
  createComponent,
  mergeProps,
  ssr,
  ssrHydrationKey,
  ssrAttribute,
  escape,
  getNextElement,
  innerHTML,
  getOwner,
  effect,
  className,
  template,
} from 'solid-js/web';

interface SlotState {
  el?: Element;
  scopeId: string;
  attachedEl?: Element;
}

const SlotCtx = createContext<SlotState>({ scopeId: '' });

export function main(slotEl: Element | undefined, scopeId: string, RootCmp: any, props: any) {
  const newProps = getSolidProps(props);
  return mainExactProps(slotEl, scopeId, RootCmp, newProps);
}

export function mainExactProps(slotEl, scopeId, RootCmp, props) {
  return createComponent(SlotCtx.Provider, {
    value: {
      el: slotEl,
      scopeId,
      attachedEl: undefined,
    },
    get children() {
      return createComponent(
        RootCmp,
        mergeProps(props, {
          get children() {
            return createComponent(SlotElement, {});
          },
        })
      );
    },
  });
}

const SlotElement = () => {
  const context = useContext(SlotCtx);
  let slotC;

  onMount(() => {
    if (slotC) {
      const { attachedEl, el } = context;
      if (el) {
        if (!attachedEl) {
          slotC.appendChild(el);
        } else if (attachedEl !== slotC) {
          throw new Error('already attached');
        }
      }
    }
  });

  // Solid components are compiled differently for server and client
  return isServer
    ? ssr(
        ['<q-slotc', '><!--SLOT--></q-slotc>'],
        ssrHydrationKey() + ssrAttribute('class', escape(context.scopeId, true), false)
      )
    : (() => {
        const _el$ = getNextElement(template(`<q-slotc></q-slotc>`, 2));
        slotC = _el$;
        innerHTML(_el$, '<!--SLOT-->');
        _el$._$owner = getOwner();
        effect(() => className(_el$, context.scopeId));
        return _el$;
      })();
};

export const getSolidProps = (props: Record<string, any>): Record<string, any> => {
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

const HOST_PREFIX = 'host:';
