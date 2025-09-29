import { component$, sync$, useSignal, $ } from '@builder.io/qwik';

type Item = {
  id: number;
  content: string;
};

export default component$(() => {
  const items1 = useSignal<Item[]>([
    { id: 1, content: '📱 Phone' },
    { id: 2, content: '💻 Laptop' },
    { id: 3, content: '🎧 Headphones' },
  ]);

  const items2 = useSignal<Item[]>([
    { id: 4, content: '⌚️ Watch' },
    { id: 5, content: '🖱 Mouse' },
    { id: 6, content: '⌨️ Keyboard' },
  ]);

  return (
    <div class="flex min-h-screen justify-center gap-8 bg-gray-50 p-8">
      <div
        data-dropzone
        class="h-[25em] w-80 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 shadow-xs transition-all duration-300 hover:border-gray-400 [&[data-over]]:border-blue-300 [&[data-over]]:bg-blue-50"
        preventdefault:dragover
        preventdefault:drop
        onDragOver$={sync$((_: DragEvent, currentTarget: HTMLDivElement) => {
          currentTarget.setAttribute('data-over', 'true');
        })}
        onDragLeave$={sync$((_: DragEvent, currentTarget: HTMLDivElement) => {
          currentTarget.removeAttribute('data-over');
        })}
        onDrop$={[
          sync$((e: DragEvent, currentTarget: HTMLDivElement) => {
            const id = e.dataTransfer?.getData('text/plain');
            currentTarget.dataset.droppedId = id;
            currentTarget.removeAttribute('data-over');
          }),
          $((e, currentTarget) => {
            const draggedElementId = currentTarget.dataset.droppedId;
            const isDropZone = currentTarget.hasAttribute('data-dropzone');

            if (draggedElementId) {
              const itemId = parseInt(draggedElementId);
              const item = items2.value.find((i) => i.id === itemId);

              if (item && isDropZone) {
                items2.value = items2.value.filter((i) => i.id !== itemId);
                items1.value = [...items1.value, item];
              } else {
                const newItems = [...items1.value];
                const targetId = parseInt(
                  (e.target as HTMLDivElement).dataset.id || '0'
                );
                if (targetId === 0) {
                  return;
                }

                const targetIndex = items1.value.findIndex(
                  (i) => i.id === targetId
                );
                const draggedIndex = items1.value.findIndex(
                  (i) => i.id === itemId
                );

                if (draggedIndex !== -1) {
                  // Sorting in the same container
                  swapElements(newItems, draggedIndex, targetIndex);
                  items1.value = newItems;
                } else {
                  // Sorting between containers
                  if (!item) {
                    return;
                  }
                  items2.value = items2.value.filter((i) => i.id !== itemId);
                  insertElement(newItems, targetIndex, item);
                  items1.value = newItems;
                }
              }
            }
          }),
        ]}
      >
        <h3 class="mb-4 text-lg font-semibold text-gray-700">Container 1</h3>
        {items1.value.map((item) => (
          <div
            key={item.id}
            data-id={item.id}
            class="min-h-[62px] mb-3 cursor-move select-none rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:scale-95"
            draggable
            onDragStart$={sync$(
              (e: DragEvent, currentTarget: HTMLDivElement) => {
                const itemId = currentTarget.getAttribute('data-id');
                if (e.dataTransfer && itemId) {
                  e.dataTransfer.setData('text/plain', itemId);
                }
              }
            )}
          >
            <span class="text-lg text-gray-700">{item.content}</span>
          </div>
        ))}
      </div>

      <div
        class="h-[25em] w-80 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 shadow-xs transition-all duration-300 hover:border-gray-400 [&[data-over]]:border-blue-300 [&[data-over]]:bg-blue-50"
        data-dropzone
        preventdefault:dragover
        preventdefault:drop
        onDragOver$={(_: DragEvent, currentTarget: HTMLDivElement) => {
          currentTarget.setAttribute('data-over', 'true');
        }}
        onDragLeave$={[
          sync$((_: DragEvent, currentTarget: HTMLDivElement) => {
            currentTarget.removeAttribute('data-over');
          }),
        ]}
        onDrop$={[
          sync$((e: DragEvent, currentTarget: HTMLDivElement) => {
            const id = e.dataTransfer?.getData('text/plain');
            currentTarget.dataset.droppedId = id;
            currentTarget.removeAttribute('data-over');
          }),
          $((e, currentTarget) => {
            const draggedElementId = currentTarget.dataset.droppedId;
            const isDropZone = currentTarget.hasAttribute('data-dropzone');

            if (draggedElementId) {
              const itemId = parseInt(draggedElementId);
              const item = items1.value.find((i) => i.id === itemId);

              if (isDropZone && item) {
                items1.value = items1.value.filter((i) => i.id !== itemId);
                items2.value = [...items2.value, item];
              } else {
                const targetId = parseInt(
                  (e.target as HTMLDivElement).dataset.id || '0'
                );
                if (targetId === 0) {
                  return;
                }
                const newItems = [...items2.value];
                const draggedIndex = items2.value.findIndex(
                  (i) => i.id === itemId
                );
                const targetIndex = items2.value.findIndex(
                  (i) => i.id === targetId
                );
                if (draggedIndex !== -1) {
                  // Sorting in the same container
                  swapElements(newItems, targetIndex, draggedIndex);
                  items2.value = newItems;
                } else {
                  // Sorting between containers
                  if (!item) {
                    return;
                  }
                  items1.value = items1.value.filter((i) => i.id !== itemId);
                  insertElement(newItems, targetIndex, item);
                  items2.value = newItems;
                }
              }
            }
          }),
        ]}
      >
        <h3 class="mb-4 text-lg font-semibold text-gray-700">Container 2</h3>
        {items2.value.map((item) => (
          <div
            key={item.id}
            data-id={item.id}
            class="min-h-[62px] mb-3 cursor-move select-none rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:scale-95"
            draggable
            onDragStart$={sync$(
              (e: DragEvent, currentTarget: HTMLDivElement) => {
                const itemId = currentTarget.getAttribute('data-id');
                if (e.dataTransfer && itemId) {
                  e.dataTransfer.setData('text/plain', itemId);
                }
              }
            )}
          >
            <span class="text-lg text-gray-700">{item.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

function swapElements(arr: Item[], index1: number, index2: number) {
  arr[index1] = arr.splice(index2, 1, arr[index1])[0];

  return arr;
}

function insertElement(arr: Item[], index: number, item: Item) {
  arr.splice(index, 0, item);
  return arr;
}
