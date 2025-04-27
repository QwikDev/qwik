import {
  Slot,
  component$,
  noSerialize,
  useContext,
  useStore,
  type NoSerialize,
  type JSXOutput,
} from '@builder.io/qwik';
import {
  Portal,
  PortalAPI,
  PortalProvider,
} from '../cookbook/portal/portal-provider';
import { UnderstandingResumability } from './component';

export default component$(() => {
  return (
    <>
      <PortalProvider>
        <HoverProvider>
          <UnderstandingResumability />
        </HoverProvider>
        <Portal name="popup" />
      </PortalProvider>
    </>
  );
});

export const HoverProvider = component$(() => {
  const portal = useContext(PortalAPI);
  const state = useStore({
    x: 0,
    y: 0,
    currentTarget: null as null | HTMLElement,
    close: null as null | NoSerialize<() => void>,
  });
  return (
    <div
      document:onMouseEnter$={(e) => {
        const target = e.target;
        if (isHTMLElement(target)) {
          if (state.currentTarget?.contains(target) || isPortal(target)) {
            return;
          }
          target.dispatchEvent(
            new CustomEvent('hover', {
              bubbles: true,
              detail: async (jsx: JSXOutput) => {
                if (state.close) {
                  return;
                }
                state.currentTarget = e.target as HTMLElement;
                state.close = noSerialize(await portal('popup', jsx));
              },
            })
          );
        }
      }}
      document:onMouseLeave$={(e) => {
        const target = e.target;
        if (isHTMLElement(target) && state.currentTarget && state.close) {
          if (!state.currentTarget.contains(target) || isPortal(target)) {
            return;
          }
          state.currentTarget = null;
          state.close();
          state.close = null;
        }
      }}
    >
      <Slot />
    </div>
  );
});

function isHTMLElement(node: any): node is HTMLElement {
  if (node instanceof HTMLElement) {
    return node.nodeType == Node.ELEMENT_NODE;
  }
  return false;
}

function isPortal(element: HTMLElement) {
  return element.closest('[data-portal]') != null;
}

export type HoverEvent = CustomEvent<(jsx: JSXOutput) => void>;
