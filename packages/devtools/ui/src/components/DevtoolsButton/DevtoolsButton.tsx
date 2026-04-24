import { component$, useSignal, $, useTask$ } from '@qwik.dev/core';
import type { State } from '../../types/state';

interface DevtoolsButtonProps {
  state: State;
}

export const DevtoolsButton = component$((props: DevtoolsButtonProps) => {
  // Signal for the button's position (distance from bottom-right corner)
  const position = useSignal({ x: 24, y: 24 });
  // Signal to track if the element is currently being dragged
  const isDragging = useSignal(false);
  // Ref for the draggable element
  const elementRef = useSignal<HTMLDivElement>();
  // Signal to store mouse position at drag start
  const startMousePos = useSignal({ x: 0, y: 0 });
  // Signal to store element position at drag start
  const startElementPos = useSignal({ x: 0, y: 0 });
  const isMoved = useSignal(false);
  // Signal to flag if a drag operation just finished, to prevent click

  /** Handles mouse movement during drag. Defined outside handleMouseDown$ for serialization. */
  const handleMouseMove = $((event: MouseEvent) => {
    if (!isDragging.value) {
      return;
    }
    const deltaX = event.clientX - startMousePos.value.x;
    const deltaY = event.clientY - startMousePos.value.y;

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      isMoved.value = true;
    }
    let newX = startElementPos.value.x - deltaX;
    let newY = startElementPos.value.y - deltaY;

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    position.value = { x: newX, y: newY };
  });

  /** Handles mouse release to end drag. Defined outside handleMouseDown$ for serialization. */
  const handleMouseUp = $(() => {
    if (isDragging.value) {
      isDragging.value = false; // Stop dragging
    }
  });

  const handleClick = $(() => {
    // Ignore click generated right after dragging.
    if (isMoved.value) {
      isMoved.value = false;
      return;
    }
    if (!props.state) {
      return;
    }
    props.state.isOpen = !props.state.isOpen;
  });

  /** Handles the mouse down event to initiate dragging. */
  const handleMouseDown = $((event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    if (!elementRef.value) {
      return;
    }

    event.preventDefault();

    startMousePos.value = { x: event.clientX, y: event.clientY };
    const computedStyle = window.getComputedStyle(elementRef.value);
    const currentRight = parseFloat(computedStyle.right) || 0;
    const currentBottom = parseFloat(computedStyle.bottom) || 0;
    startElementPos.value = { x: currentRight, y: currentBottom };
    position.value = { x: currentRight, y: currentBottom };

    isDragging.value = true;
    isMoved.value = false;
  });

  // Effect to add/remove window event listeners based on dragging state
  useTask$(({ track, cleanup }) => {
    track(() => isDragging.value);
    if (isDragging.value && typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      cleanup(() => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      });
    }
  });

  return (
    <div
      ref={elementRef}
      class={[
        'fixed z-[9990] flex h-14 w-14 origin-center items-center justify-center rounded-full select-none',
        props.state?.isOpen && !isDragging.value
          ? 'glass-button shadow-accent/20 pointer-events-none scale-90 rotate-90 opacity-0'
          : 'glass-button animate-pulsar opacity-100 hover:scale-105 hover:shadow-[0_0_20px_rgba(22,182,246,0.5)]',
        !isDragging.value
          ? 'cursor-pointer transition-all duration-500 ease-out'
          : 'scale-95 cursor-grabbing opacity-80',
      ]}
      style={{
        bottom: `${position.value.y}px`,
        right: `${position.value.x}px`,
        userSelect: isDragging.value ? 'none' : undefined,
        transition: isDragging.value ? 'none' : undefined,
      }}
      onMouseDown$={handleMouseDown}
      onClick$={handleClick}
    >
      <img
        width={28}
        height={28}
        src="https://qwik.dev/logos/qwik-logo.svg"
        alt="Qwik Logo"
        draggable={false}
        class="pointer-events-none h-7 w-7 opacity-90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
      />
    </div>
  );
});
