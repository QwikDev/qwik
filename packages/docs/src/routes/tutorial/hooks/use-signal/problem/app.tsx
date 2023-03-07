import { component$, useSignal, useVisibleTask$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({
    width: 0,
    height: 0,
  });
  const outputRef = useSignal<Element>();
  useVisibleTask$(() => {
    if (outputRef.value) {
      const rect = outputRef.value.getBoundingClientRect();
      store.width = Math.round(rect.width);
      store.height = Math.round(rect.height);
    }
  });

  return (
    <div>
      <div style={{ border: '1px solid red', width: '100px' }}>
        Change text value here to stretch the box.
      </div>
      <div>
        The above red box is {store.height} pixels high and {store.width} pixels wide.
      </div>
    </div>
  );
});
