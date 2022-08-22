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
  const state = useStore({
    count: 0,
  });
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
      <button id="btn-toggle-render" type="button" onClick$={() => state.count++}>
        Rerender
      </button>
      <MouseEvents key={state.count} />
    </div>
  );
});

export const MouseEvents = component$(() => {
  const mouseDoc = useDocumentMouse();
  const mouseWin = useWindowMouse();
  const mouseSelf = useSelfMouse();

  return (
    <div>
      <p class="document">
        (Document: x: {mouseDoc.x}, y: {mouseDoc.y})
      </p>
      <p class="window">
        (Window: x: {mouseWin.x}, y: {mouseWin.y})
      </p>
      <p class="self">
        (Host: x: {mouseSelf.x}, y: {mouseSelf.y}, inside: {mouseSelf.inside})
      </p>
    </div>
  );
});
