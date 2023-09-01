import { useTask$, type Signal } from '@builder.io/qwik';

interface UseTrapFocusProps {
  containerRef: Signal<Element>;
}

export function useTrapFocus(props: UseTrapFocusProps) {
  useTask$(({ track }) => {
    const container = track(() => props.containerRef.value) as HTMLElement;
    if (!container) {
      return undefined;
    }

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'a[href]:not([disabled]), button:not([disabled]), input:not([disabled])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return;
      }

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    container.addEventListener('keydown', trapFocus);

    return () => {
      container.removeEventListener('keydown', trapFocus);
    };
  });
}
