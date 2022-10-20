import { Component, createContext, createElement, createRef } from 'react';
import { filterProps } from './qwikify';

interface SlotState {
  el?: Element;
  scopeId: string;
  attachedEl?: Element;
}
const SlotCtx = createContext<SlotState>({ scopeId: '' });

export function main(slotEl: Element | undefined, scopeId: string, RootCmp: any, props: any) {
  const newProps = filterProps(props);
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
    const slotState = this.context;
    const slotC = this.slotC.current;
    if (slotC) {
      const { attachedEl, el } = slotState;
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
  const obj = filterProps(props);
  obj.children = createElement('qwik-slot', {
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: { __html: '' },
  });
  return obj;
};
