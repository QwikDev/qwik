import { component$, useOnDocument, useStore, $, Host, useOnWindow, useOn } from '@builder.io/qwik';

export function useDocumentMouse() {
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

export function useWindowMouse() {
  const mousePosition = useStore({ x: 0, y: 0 });
  useOnWindow(
    'mousemove',
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    })
  );
  return mousePosition;
}

export function useSelfMouse() {
  const mousePosition = useStore({ x: 0, y: 0 });
  useOn(
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
      <ul>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
        <li>1</li>
      </ul>
      <MouseEvents />
    </Host>
  );
});

export const MouseEvents = component$(() => {
  const mouseDoc = useDocumentMouse();
  const mouseWin = useWindowMouse();
  const mouseSelf = useSelfMouse();

  return (
    <div>
      <p>
        (Document: x: {mouseDoc.x}, y: {mouseDoc.y})
      </p>
      <p>
        (Window: x: {mouseWin.x}, y: {mouseWin.y})
      </p>
      <p>
        (Host: x: {mouseSelf.x}, y: {mouseSelf.y})
      </p>
    </div>
  );
});
