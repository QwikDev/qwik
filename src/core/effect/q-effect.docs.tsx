import { h, Fragment, qComponent, qHook, useEvent } from '@builder.io/qwik';
import { qEffect } from './q-effect';

export const Header = qComponent<{}, { mouse: MousePosition }>({
  tagName: 'header', // optional
  onMount: qHook(() => ({ mouse: useMousePosition({}) })),
  onRender: qHook((_, { mouse }) => {
    return (
      <>
        {mouse.x}, {mouse.y}
      </>
    );
  }),
});

////////////////////////////////////////////////////
////////////////////////////////////////////////////
////////////////////////////////////////////////////

interface MousePosition {
  x: number;
  y: number;
}

const useMousePosition = qEffect<{}, MousePosition>({
  onMount: () => ({ x: 0, y: 0, scroll: useScrollPosition({}) }),
  listen: {
    ['on:document:mousemove']: qHook((_, state: MousePosition) => {
      const mEvent = useEvent<MouseEvent>();
      //const transient = useTransient(MousePositionTransient, state);
      state.x = mEvent.x;
      state.y = mEvent.y;
    }),
  },
});

export function MousePositionTransient() {
  // instruction on how to build one.
}

const useScrollPosition = qEffect({} as any);
