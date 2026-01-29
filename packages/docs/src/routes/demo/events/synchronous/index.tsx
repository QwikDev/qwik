import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';

export default component$(() => {
  const draggableRef = useSignal<HTMLElement>();
  const dragStatus = useSignal('');

  useVisibleTask$(({ cleanup }) => {
    if (draggableRef.value) {
      // Use the DOM API to add an event listener.
      const dragstart = () => (dragStatus.value = 'dragstart');
      const dragend = () => (dragStatus.value = 'dragend');

      draggableRef.value!.addEventListener('dragstart', dragstart);
      draggableRef.value!.addEventListener('dragend', dragend);
      cleanup(() => {
        draggableRef.value!.removeEventListener('dragstart', dragstart);
        draggableRef.value!.removeEventListener('dragend', dragend);
      });
    }
  });

  return (
    <div>
      <div draggable ref={draggableRef}>
        Drag me!
      </div>
      <p>{dragStatus.value}</p>
    </div>
  );
});
