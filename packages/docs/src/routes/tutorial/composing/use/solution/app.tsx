import { component$, useOnDocument, useStore, $ } from '@qwik.dev/core';

export function useMousePosition() {
  const mousePosition = useStore({ x: 0, y: 0 });
  useOnDocument(
    'mousemove',
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    })
  );
  return mousePosition;
}

export default component$(() => {
  const mousePosition = useMousePosition();
  return (
    <div>
      (x: {mousePosition.x}, y: {mousePosition.y})
    </div>
  );
});
