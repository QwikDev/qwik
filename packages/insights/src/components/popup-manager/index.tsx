import {
  type Component,
  Slot,
  component$,
  useStore,
  useSignal,
  $,
  type NoSerialize,
} from '@builder.io/qwik';
import { CloseIcon } from '../icons/close';

export const PopupManager = component$(() => {
  const popupTarget = useSignal<HTMLElement>();
  const popup = useStore({
    Component: null as null | NoSerialize<Component<any>>,
    props: null as any,
    currentTarget: null as null | HTMLElement,
    popupTarget: null as null | HTMLElement,
    x: 0,
    y: 0,
  });
  return (
    <div
      document:onMouseEnter$={(e) => {
        const target = e.target;
        if (isHTMLElement(target)) {
          if (popup.currentTarget?.contains(target) || popupTarget.value?.contains(target)) {
            return;
          }
          target.dispatchEvent(
            new CustomEvent('popup', {
              bubbles: false,
              detail: {
                show<T extends {}>(component: Component<T>, props: T) {
                  // TODO: Remove cast once https://github.com/QwikDev/qwik/issues/4794 is fixed
                  (popup as { Component: any }).Component = component;
                  popup.props = props;
                  popup.currentTarget = target;
                },
              } satisfies PopupEvent['detail'],
            })
          );
        }
      }}
      document:onMouseLeave$={(e) => {
        const target = e.target;
        if (isHTMLElement(target)) {
          if (
            e.shiftKey ||
            popup.currentTarget?.contains(target) ||
            popupTarget.value?.contains(target) ||
            popupTarget.value?.contains(e.relatedTarget as HTMLElement | null)
          ) {
            return;
          }
          popup.currentTarget = null;
        }
      }}
      document:onMouseMove$={(e) => {
        if (!e.shiftKey) {
          popup.x = e.clientX;
          popup.y = e.clientY;
        }
      }}
    >
      <Slot />
      {popup.currentTarget && popup.Component ? (
        <div
          ref={popupTarget}
          class="fixed inline-block border border-slate-200 bg-white shadow-lg z-10"
          style={{
            top: popup.y + 4 + 'px',
            left: popup.x + 4 + 'px',
          }}
        >
          <CloseIcon
            onClick$={$(() => (popup.currentTarget = null))}
            class="absolute right-0 m-0"
          />
          <popup.Component {...popup.props} />
        </div>
      ) : null}
    </div>
  );
});

function isHTMLElement(target: any): target is HTMLElement {
  return target && target.nodeType === 1;
}

export type PopupEvent = CustomEvent<{
  show<PROPS extends {}>(component: Component<PROPS>, props: PROPS): void;
}>;
