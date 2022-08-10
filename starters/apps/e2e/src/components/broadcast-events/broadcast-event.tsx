import { component$, useOnDocument, useStore, $, useOnWindow, useOn } from '@builder.io/qwik';

export function useDocumentMouse() {
  const mousePosition = useStore({ x: 0, y: 0, inside: 'false' });
  useOnDocument(
    'mousemove',
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    })
  );
  useOnDocument(
    'mouseenter',
    $(() => {
      mousePosition.inside = 'true';
    })
  );
  useOnDocument(
    'mouseleave',
    $(() => {
      mousePosition.inside = 'false';
    })
  );
  return mousePosition;
}

export function useWindowMouse() {
  const mousePosition = useStore({ x: 0, y: 0, inside: 'false' });
  useOnWindow(
    'mousemove',
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    })
  );
  useOnWindow(
    'mouseenter',
    $(() => {
      mousePosition.inside = 'true';
    })
  );
  useOnWindow(
    'mouseleave',
    $(() => {
      mousePosition.inside = 'false';
    })
  );
  return mousePosition;
}

export function useSelfMouse() {
  const mousePosition = useStore({ x: 0, y: 0, inside: 'false' });
  useOn(
    'mousemove',
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    })
  );
  useOn(
    'mouseenter',
    $(() => {
      mousePosition.inside = 'true';
    })
  );
  useOn(
    'mouseleave',
    $(() => {
      mousePosition.inside = 'false';
    })
  );
  return mousePosition;
}

export const BroadcastEvents = component$(() => {
  return (
    <div>
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
    </div>
  );
});

export const MouseEvents = component$(() => {
  const mouseDoc = useDocumentMouse();
  const mouseWin = useWindowMouse();
  const mouseSelf = useSelfMouse();

  return (
    <div>
      <p>
        (Document: x: {mouseDoc.x}, y: {mouseDoc.y}, inside: {mouseDoc.inside})
      </p>
      <p>
        (Window: x: {mouseWin.x}, y: {mouseWin.y}, inside: {mouseWin.inside})
      </p>
      <p>
        (Host: x: {mouseSelf.x}, y: {mouseSelf.y}, inside: {mouseSelf.inside})
      </p>
    </div>
  );
});
