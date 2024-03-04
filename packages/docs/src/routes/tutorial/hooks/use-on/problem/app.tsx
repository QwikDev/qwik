import { $, component$, useOn, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore(
    {
      element: { x: 0, y: 0 },
      window: { x: 0, y: 0 },
      document: { x: 0, y: 0 },
    },
    { deep: true }
  );
  useOn(
    'mousemove',
    $((event) => {
      store.element.x = event.x;
      store.element.y = event.y;
    })
  );
  return (
    <ul>
      <li>
        Element: ({store.element.x}, {store.element.y})
      </li>
      <li>
        Document: ({store.document.x}, {store.document.y})
      </li>
      <li>
        Window: ({store.window.x}, {store.window.y})
      </li>
    </ul>
  );
});
