import { Component, createContext, onMount, Ref, useContext } from 'solid-js';

interface SlotState {
  el?: Element;
  scopeId: string;
  attachedEl?: Element;
}

const SlotCtx = createContext<SlotState>({ scopeId: '' });

export function mainExactProps(
  slotEl: Element | undefined,
  scopeId: string,
  RootCmp: any,
  props: any
) {
  return (
    <SlotCtx.Provider value={{ el: slotEl, scopeId, attachedEl: undefined }}>
      <RootCmp {...props}>
        <SlotElement />
      </RootCmp>
    </SlotCtx.Provider>
  );
}

export const SlotElement: Component = () => {
  const context = useContext(SlotCtx);
  let slotC: Ref<HTMLElement>;

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

  return <q-slotc class={context.scopeId} innerHTML="<!--SLOT-->" ref={slotC}></q-slotc>;
};
