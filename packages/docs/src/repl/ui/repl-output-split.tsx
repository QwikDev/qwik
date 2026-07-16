import { $, component$, useOnWindow, useSignal } from '@qwik.dev/core';

const MIN_LEFT_WIDTH = 180;
const MIN_RIGHT_WIDTH = 320;
const RESIZER_WIDTH = 12;

export const ReplOutputSplit = component$(
  ({ left, right, rootClass, defaultLeftWidth = 248 }: ReplOutputSplitProps) => {
    const hostRef = useSignal<Element>();
    const leftWidth = useSignal(defaultLeftWidth);
    const isDragging = useSignal(false);
    const startX = useSignal(0);
    const startWidth = useSignal(defaultLeftWidth);
    const maxLeftWidth = useSignal(defaultLeftWidth);

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

        leftWidth.value = Math.min(
          Math.max(startWidth.value + event.clientX - startX.value, MIN_LEFT_WIDTH),
          maxLeftWidth.value
        );
      })
    );

    useOnWindow('pointerup', stopDragging$);
    useOnWindow('pointercancel', stopDragging$);

    const onPointerDown$ = $((event: PointerEvent) => {
      const host = hostRef.value as HTMLElement | undefined;
      if (!host) {
        return;
      }

      event.preventDefault();

      startX.value = event.clientX;
      startWidth.value = leftWidth.value;
      maxLeftWidth.value = Math.max(
        MIN_LEFT_WIDTH,
        host.getBoundingClientRect().width - MIN_RIGHT_WIDTH - RESIZER_WIDTH
      );
      isDragging.value = true;
      document.body.classList.add('repl-resizing-columns');
    });

    return (
      <div
        ref={hostRef}
        class={rootClass}
        style={{
          '--output-left-width': `${leftWidth.value}px`,
        }}
      >
        {left}
        <div
          class="output-column-resizer"
          onPointerDown$={onPointerDown$}
          role="separator"
          aria-label="Resize columns"
          aria-orientation="vertical"
        >
          <span class="output-column-resizer-line" />
        </div>
        {right}
      </div>
    );
  }
);

interface ReplOutputSplitProps {
  left: any;
  right: any;
  rootClass: string;
  defaultLeftWidth?: number;
}
