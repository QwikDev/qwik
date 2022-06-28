import { component$, useOnDocument, useStore, $, Host } from '@builder.io/qwik';

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


export const BroadcastEvents = component$(() => {
  return (
    <Host>
      <MouseEvents />
    </Host>
  );
});

export const MouseEvents = component$(() => {
  const mousePos = useMousePosition();
  return (
    <div>
      (x: {mousePos.x}, y: {mousePos.y})
    </div>
  );
});

