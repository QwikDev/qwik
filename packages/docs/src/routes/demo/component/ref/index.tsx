import { component$, useVisibleTask$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const width = useSignal(0);
  const height = useSignal(0);
  const outputRef = useSignal<Element>();

  useVisibleTask$(() => {
    if (outputRef.value) {
      const rect = outputRef.value.getBoundingClientRect();
      width.value = Math.round(rect.width);
      height.value = Math.round(rect.height);
    }
  });

  return (
    <section>
      <article
        ref={outputRef}
        style={{ border: '1px solid red', width: '100px' }}
      >
        Change text value here to stretch the box.
      </article>
      <p>
        The above red box is {height.value} pixels high and {width.value}{' '}
        pixels wide.
      </p>
    </section>
  );
});
