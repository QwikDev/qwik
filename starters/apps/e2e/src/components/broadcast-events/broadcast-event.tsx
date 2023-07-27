import {
  component$,
  useOnDocument,
  useStore,
  $,
  useOnWindow,
  useOn,
} from "@builder.io/qwik";

export function useDocumentMouse() {
  const mousePosition = useStore({ x: 0, y: 0, inside: "false" });
  useOnDocument(
    "mousemove",
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    }),
  );
  useOnDocument(
    "mouseenter",
    $(() => {
      mousePosition.inside = "true";
    }),
  );
  useOnDocument(
    "mouseleave",
    $(() => {
      mousePosition.inside = "false";
    }),
  );
  return mousePosition;
}

export function useWindowMouse() {
  const mousePosition = useStore({ x: 0, y: 0, inside: "false" });
  useOnWindow(
    "mousemove",
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    }),
  );
  useOnWindow(
    "mouseenter",
    $(() => {
      mousePosition.inside = "true";
    }),
  );
  useOnWindow(
    "mouseleave",
    $(() => {
      mousePosition.inside = "false";
    }),
  );
  return mousePosition;
}

export function useSelfMouse() {
  const mousePosition = useStore({ x: 0, y: 0, inside: "false" });
  useOn(
    "mousemove",
    $((event: Event) => {
      mousePosition.x = (event as MouseEvent).clientX;
      mousePosition.y = (event as MouseEvent).clientY;
    }),
  );
  useOn(
    "mouseenter",
    $(() => {
      mousePosition.inside = "true";
    }),
  );
  useOn(
    "mouseleave",
    $(() => {
      mousePosition.inside = "false";
    }),
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
      <button
        id="btn-toggle-render"
        type="button"
        onClick$={() => state.count++}
      >
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

  const mouseDoc2 = useStore({ x: 0, y: 0 });
  const mouseWin2 = useStore({ x: 0, y: 0 });
  const mouseSelf2 = useStore({ x: 0, y: 0 });

  return (
    <div
      onMouseMove$={(event) => {
        mouseSelf2.x = event.clientX;
        mouseSelf2.y = event.clientY;
      }}
      window:onMouseMove$={(event) => {
        mouseWin2.x = event.clientX;
        mouseWin2.y = event.clientY;
      }}
      document:onMouseMove$={(event) => {
        mouseDoc2.x = event.clientX;
        mouseDoc2.y = event.clientY;
      }}
    >
      <p class="document">
        (Document: x: {mouseDoc.x}, y: {mouseDoc.y})
      </p>
      <p class="document2">
        (Document2: x: {mouseDoc2.x}, y: {mouseDoc2.y})
      </p>
      <p class="window">
        (Window: x: {mouseWin.x}, y: {mouseWin.y})
      </p>
      <p class="window2">
        (Window2: x: {mouseWin2.x}, y: {mouseWin2.y})
      </p>
      <p class="self">
        (Host: x: {mouseSelf.x}, y: {mouseSelf.y}, inside: {mouseSelf.inside})
      </p>
      <p class="self2">
        (Host2: x: {mouseSelf2.x}, y: {mouseSelf2.y})
      </p>
    </div>
  );
});
