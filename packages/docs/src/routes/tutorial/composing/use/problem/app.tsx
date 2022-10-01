import { component$, useOnDocument, useStore, $ } from '@builder.io/qwik';

export const App = component$(() => {
  const mousePosition = useStore({ x: 0, y: 0 });
  useOnDocument(
    'mousemove',
    $((event: MouseEvent) => {
      mousePosition.x = event.clientX;
      mousePosition.y = event.clientY;
    })
  );
  return (
    <div>
      (x: {mousePosition.x}, y: {mousePosition.y})
    </div>
  );
});
