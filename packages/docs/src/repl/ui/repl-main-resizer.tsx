import { $, component$, useOnWindow, useSignal, useVisibleTask$ } from '@qwik.dev/core';

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 360;
const RESIZER_WIDTH = 24;
const DEFAULT_LEFT_RATIO = 0.5;

const clampLeftWidth = (parentWidth: number, requestedWidth: number) => {
  const availableWidth = Math.max(parentWidth - RESIZER_WIDTH, 0);
  const minLeftWidth = Math.min(MIN_LEFT_WIDTH, availableWidth);
  const maxLeftWidth = Math.max(
    minLeftWidth,
    Math.min(Math.max(availableWidth - MIN_RIGHT_WIDTH, 0), availableWidth)
  );
  const nextWidth = Math.min(Math.max(requestedWidth, minLeftWidth), maxLeftWidth);
  return {
    availableWidth,
    nextWidth,
    ratio: availableWidth > 0 ? nextWidth / availableWidth : DEFAULT_LEFT_RATIO,
  };
};

const getLeftWidthStyle = (parent: HTMLElement, requestedWidth: number) => {
  const { ratio } = clampLeftWidth(parent.getBoundingClientRect().width, requestedWidth);
  parent.style.setProperty(
    '--repl-main-left-width',
    `calc((100% - ${RESIZER_WIDTH}px) * ${ratio.toFixed(6)})`
  );
  return ratio;
};

export const ReplMainResizer = component$(() => {
  const hostRef = useSignal<Element>();
  const leftRatio = useSignal(DEFAULT_LEFT_RATIO);
  const isDragging = useSignal(false);
  const startX = useSignal(0);
  const startWidth = useSignal(0);

  useVisibleTask$(({ cleanup }) => {
    const host = hostRef.value as HTMLElement | undefined;
    const parent = host?.parentElement as HTMLElement | undefined;
    if (!parent) {
      return;
    }

    leftRatio.value = getLeftWidthStyle(
      parent,
      Math.floor((parent.getBoundingClientRect().width - RESIZER_WIDTH) * DEFAULT_LEFT_RATIO)
    );

    const resizeObserver = new ResizeObserver(() => {
      if (!isDragging.value) {
        const parentWidth = parent.getBoundingClientRect().width;
        const requestedWidth = Math.max((parentWidth - RESIZER_WIDTH) * leftRatio.value, 0);
        leftRatio.value = getLeftWidthStyle(parent, requestedWidth);
      }
    });
    resizeObserver.observe(parent);

    cleanup(() => {
      resizeObserver.disconnect();
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
      if (!parent) {
        return;
      }

      const nextWidth = startWidth.value + event.clientX - startX.value;
      leftRatio.value = getLeftWidthStyle(parent, nextWidth);
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
    startWidth.value = Math.max(
      (parent.getBoundingClientRect().width - RESIZER_WIDTH) * leftRatio.value,
      MIN_LEFT_WIDTH
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
