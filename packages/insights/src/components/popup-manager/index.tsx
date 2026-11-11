import {
  type Component,
  Slot,
  component$,
  useStore,
  useSignal,
  $,
  type NoSerialize,
} from '@qwik.dev/core';
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
        if (!e.shiftKey && !popupTarget.value?.contains(e.target as Node)) {
          popup.x = e.clientX;
          popup.y = e.clientY;
        }
      }}
    >
      <Slot />
      {popup.currentTarget && popup.Component ? (
        <div
          ref={popupTarget}
          class="fixed w-[min(42rem,calc(100vw-16px))] max-h-[min(32rem,calc(100dvh-16px))] overflow-auto border border-slate-200 bg-white shadow-lg z-10"
          style={{
            top: `clamp(8px, ${popup.y + 4}px, calc(100dvh - min(32rem, 100dvh - 16px) - 8px))`,
            left: `clamp(8px, ${popup.x + 4}px, calc(100vw - min(42rem, 100vw - 16px) - 8px))`,
          }}
        >
          <button
            type="button"
            aria-label="Close symbol details"
            onClick$={$(() => (popup.currentTarget = null))}
            class="absolute right-2 top-2 p-1"
          >
            <CloseIcon />
          </button>
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
