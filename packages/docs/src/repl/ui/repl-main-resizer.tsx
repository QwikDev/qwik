import { $, component$, useOnWindow, useSignal, useVisibleTask$ } from '@qwik.dev/core';

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 360;
const RESIZER_WIDTH = 24;

export const ReplMainResizer = component$(() => {
  const hostRef = useSignal<Element>();
  const leftWidth = useSignal(0);
  const isDragging = useSignal(false);
  const startX = useSignal(0);
  const startWidth = useSignal(0);
  const maxLeftWidth = useSignal(0);

  useVisibleTask$(({ cleanup }) => {
    const host = hostRef.value as HTMLElement | undefined;
    const parent = host?.parentElement as HTMLElement | undefined;
    if (!parent) {
      return;
    }

    const initialWidth = Math.max(
      MIN_LEFT_WIDTH,
      Math.floor((parent.getBoundingClientRect().width - RESIZER_WIDTH) / 2)
    );
    leftWidth.value = initialWidth;
    parent.style.setProperty('--repl-main-left-width', `${leftWidth.value}px`);

    cleanup(() => {
      parent.style.removeProperty('--repl-main-left-width');
      document.body.classList.remove('repl-resizing-columns');
    });
  });

  const stopDragging$ = $(() => {
    if (!isDragging.value) {
      return;
    }

    isDragging.value = false;
    document.body.classList.remove('repl-resizing-columns');
  });

  useOnWindow(
    'pointermove',
    $((event: PointerEvent) => {
      if (!isDragging.value) {
        return;
      }

      const host = hostRef.value as HTMLElement | undefined;
      const parent = host?.parentElement as HTMLElement | undefined;
      const nextWidth = Math.min(
        Math.max(startWidth.value + event.clientX - startX.value, MIN_LEFT_WIDTH),
        maxLeftWidth.value
      );
      leftWidth.value = nextWidth;
      parent?.style.setProperty('--repl-main-left-width', `${nextWidth}px`);
    })
  );

  useOnWindow('pointerup', stopDragging$);
  useOnWindow('pointercancel', stopDragging$);

  const onPointerDown$ = $((event: PointerEvent) => {
    const host = hostRef.value as HTMLElement | undefined;
    const parent = host?.parentElement as HTMLElement | undefined;
    if (!parent) {
      return;
    }

    event.preventDefault();

    startX.value = event.clientX;
    startWidth.value =
      leftWidth.value || Math.floor((parent.getBoundingClientRect().width - RESIZER_WIDTH) / 2);
    maxLeftWidth.value = Math.max(
      MIN_LEFT_WIDTH,
      parent.getBoundingClientRect().width - MIN_RIGHT_WIDTH - RESIZER_WIDTH
    );
    isDragging.value = true;
    document.body.classList.add('repl-resizing-columns');
  });

  return (
    <div
      ref={hostRef}
      class="repl-main-resizer"
      onPointerDown$={onPointerDown$}
      role="separator"
      aria-label="Resize input and output columns"
      aria-orientation="vertical"
    >
      <span class="repl-main-resizer-line" />
    </div>
  );
});
