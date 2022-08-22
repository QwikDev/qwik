import { useWatch$ } from '@builder.io/qwik';

interface UseTrapFocusProps {
  containerRef: any;
}

export function useTrapFocus(props: UseTrapFocusProps) {
  useWatch$(({ track }) => {
    const container = track(props.containerRef, 'current') as HTMLElement;
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
