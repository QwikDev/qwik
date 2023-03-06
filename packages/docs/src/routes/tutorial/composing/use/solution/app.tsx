import { component$, useOnDocument, useStore, $ } from '@builder.io/qwik';

export function useMousePosition() {
  const mousePosition = useStore({ x: 0, y: 0 });
  useOnDocument(
    'mousemove',
    $((event: Event) => {
      mousePosition.x = event.clientX;
      mousePosition.y = event.clientY;
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
