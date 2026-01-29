import { $, component$, useOnDocument, useStore } from '@builder.io/qwik';

// Assume reusable use method that does not have access to JSX
// but needs to register event handlers.
function useMousePosition() {
  const position = useStore({ x: 0, y: 0 });
  useOnDocument(
    'mousemove',
    $((event) => {
      const { x, y } = event as MouseEvent;
      position.x = x;
      position.y = y;
    })
  );
  return position;
}

export default component$(() => {
  const pos = useMousePosition();
  return (
    <div>
      MousePosition: ({pos.x}, {pos.y})
    </div>
  );
});
