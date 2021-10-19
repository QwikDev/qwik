import { h, Fragment, qComponent, qHook, useEvent } from '@builder.io/qwik';
import { qEffect } from './q-effect';

export const Header = qComponent<{}, { mouse: MousePosition }>({
  onMount: qHook(() => ({ mouse: useMousePosition({}) })),
  onRender: qHook((_, { mouse }) => (
    <span>
      {mouse.x}, {mouse.y}
    </span>
  )),
});

////////////////////////////////////////////////////
////////////////////////////////////////////////////
////////////////////////////////////////////////////

interface MousePosition {
  x: number;
  y: number;
}

const useMousePosition = qEffect<{}, MousePosition>({
  onMount: () => ({ x: 0, y: 0 }),
  listen: {
    ['on:document:mousemove']: qHook((_, state: MousePosition) => {
      const mEvent = useEvent<MouseEvent>();
      state.x = mEvent.x;
      state.y = mEvent.y;
    }),
  },
});
