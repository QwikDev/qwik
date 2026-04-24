import {
  $,
  component$,
  isBrowser,
  Slot,
  type Signal,
  useSignal,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { State } from '../../types/state';
import { IconArrowsPointingIn, IconArrowsPointingOut, IconXMark } from '../Icons/Icons';

interface DevtoolsPanelProps {
  state: State;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type InteractionMode = 'drag' | ResizeDirection | null;

const WINDOW_MARGIN = 24;
const COMPACT_MARGIN = 8;
const DEFAULT_WIDTH = 1180;
const DEFAULT_HEIGHT = 760;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const MIN_WIDTH_MD = 520;
const MIN_HEIGHT_MD = 360;
const FULLSCREEN_PANEL_STYLE = {
  left: '0px',
  top: '0px',
  width: '100vw',
  height: '100vh',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getWindowMargin() {
  return window.innerWidth < 640 || window.innerHeight < 640 ? COMPACT_MARGIN : WINDOW_MARGIN;
}

function getMinWidth() {
  const margin = getWindowMargin();
  const preferredWidth = window.innerWidth >= 768 ? MIN_WIDTH_MD : MIN_WIDTH;
  return Math.min(preferredWidth, Math.max(window.innerWidth - margin * 2, 240));
}

function getMinHeight() {
  const margin = getWindowMargin();
  const preferredHeight = window.innerHeight >= 768 ? MIN_HEIGHT_MD : MIN_HEIGHT;
  return Math.min(preferredHeight, Math.max(window.innerHeight - margin * 2, 220));
}

function getMaxWidth() {
  const margin = getWindowMargin();
  return Math.max(window.innerWidth - margin * 2, getMinWidth());
}

function getMaxHeight() {
  const margin = getWindowMargin();
  return Math.max(window.innerHeight - margin * 2, getMinHeight());
}

function normalizeBounds(bounds: State['panelBounds']) {
  const margin = getWindowMargin();
  const width = clamp(bounds.width, getMinWidth(), getMaxWidth());
  const height = clamp(bounds.height, getMinHeight(), getMaxHeight());
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);

  return {
    x: clamp(bounds.x, margin, maxX),
    y: clamp(bounds.y, margin, maxY),
    width,
    height,
  };
}

function createDefaultBounds() {
  const margin = getWindowMargin();
  const width = Math.min(DEFAULT_WIDTH, getMaxWidth());
  const height = Math.min(DEFAULT_HEIGHT, getMaxHeight());

  return normalizeBounds({
    x: window.innerWidth - width - margin,
    y: window.innerHeight - height - margin,
    width,
    height,
  });
}

function hasValidBounds(bounds: State['panelBounds']) {
  return bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0;
}

function getInteractionCursor(mode: InteractionMode) {
  switch (mode) {
    case 'drag':
      return 'grabbing';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    default:
      return '';
  }
}

function resetPointerStyles() {
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}

function updatePanelBounds(
  panelBounds: Signal<State['panelBounds']>,
  state: State,
  bounds: State['panelBounds']
) {
  const nextBounds = { ...bounds };
  panelBounds.value = nextBounds;
  state.panelBounds.x = nextBounds.x;
  state.panelBounds.y = nextBounds.y;
  state.panelBounds.width = nextBounds.width;
  state.panelBounds.height = nextBounds.height;
}

export const DevtoolsPanel = component$((props: DevtoolsPanelProps) => {
  const interactionMode = useSignal<InteractionMode>(null);
  const startMousePosition = useSignal({ x: 0, y: 0 });
  const startBounds = useSignal<State['panelBounds']>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const panelBounds = useSignal<State['panelBounds']>({
    ...props.state.panelBounds,
  });

  const stopInteraction = $(() => {
    interactionMode.value = null;
    resetPointerStyles();
  });

  const handleMouseMove = $((event: MouseEvent) => {
    if (!interactionMode.value || props.state.isPanelFullscreen) {
      return;
    }

    const deltaX = event.clientX - startMousePosition.value.x;
    const deltaY = event.clientY - startMousePosition.value.y;

    if (interactionMode.value === 'drag') {
      updatePanelBounds(
        panelBounds,
        props.state,
        normalizeBounds({
          ...startBounds.value,
          x: startBounds.value.x + deltaX,
          y: startBounds.value.y + deltaY,
        })
      );
      return;
    }

    const direction = interactionMode.value;
    const minWidth = getMinWidth();
    const minHeight = getMinHeight();
    const margin = getWindowMargin();
    let nextX = startBounds.value.x;
    let nextY = startBounds.value.y;
    let nextWidth = startBounds.value.width;
    let nextHeight = startBounds.value.height;

    if (direction.includes('e')) {
      nextWidth = clamp(
        startBounds.value.width + deltaX,
        minWidth,
        window.innerWidth - startBounds.value.x - margin
      );
    }

    if (direction.includes('s')) {
      nextHeight = clamp(
        startBounds.value.height + deltaY,
        minHeight,
        window.innerHeight - startBounds.value.y - margin
      );
    }

    if (direction.includes('w')) {
      const maxX = startBounds.value.x + startBounds.value.width - minWidth;
      nextX = clamp(startBounds.value.x + deltaX, margin, maxX);
      nextWidth = startBounds.value.width - (nextX - startBounds.value.x);
    }

    if (direction.includes('n')) {
      const maxY = startBounds.value.y + startBounds.value.height - minHeight;
      nextY = clamp(startBounds.value.y + deltaY, margin, maxY);
      nextHeight = startBounds.value.height - (nextY - startBounds.value.y);
    }

    updatePanelBounds(
      panelBounds,
      props.state,
      normalizeBounds({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      })
    );
  });

  const handleDragStart = $((event: MouseEvent) => {
    if (event.button !== 0 || props.state.isPanelFullscreen) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const normalizedBounds = hasValidBounds(panelBounds.value)
      ? normalizeBounds(panelBounds.value)
      : createDefaultBounds();

    updatePanelBounds(panelBounds, props.state, normalizedBounds);
    interactionMode.value = 'drag';
    startMousePosition.value = { x: event.clientX, y: event.clientY };
    startBounds.value = { ...normalizedBounds };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = getInteractionCursor('drag');
  });

  const handleResizeStart = $((direction: ResizeDirection, event: MouseEvent) => {
    if (event.button !== 0 || props.state.isPanelFullscreen) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const normalizedBounds = hasValidBounds(panelBounds.value)
      ? normalizeBounds(panelBounds.value)
      : createDefaultBounds();

    updatePanelBounds(panelBounds, props.state, normalizedBounds);
    interactionMode.value = direction;
    startMousePosition.value = { x: event.clientX, y: event.clientY };
    startBounds.value = { ...normalizedBounds };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = getInteractionCursor(direction);
  });

  const handleToggleFullscreen = $(() => {
    if (!isBrowser) {
      return;
    }

    if (props.state.isPanelFullscreen) {
      props.state.isPanelFullscreen = false;
      updatePanelBounds(
        panelBounds,
        props.state,
        normalizeBounds(props.state.lastPanelBounds ?? createDefaultBounds())
      );
      return;
    }

    const normalizedBounds = hasValidBounds(panelBounds.value)
      ? normalizeBounds(panelBounds.value)
      : createDefaultBounds();
    updatePanelBounds(panelBounds, props.state, normalizedBounds);
    props.state.lastPanelBounds = { ...normalizedBounds };
    props.state.isPanelFullscreen = true;
    interactionMode.value = null;
    resetPointerStyles();
  });

  useTask$(({ cleanup }) => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '`' && e.metaKey) {
        props.state.isOpen = !props.state.isOpen;
      }

      if (e.key === 'Escape' && props.state.isOpen) {
        props.state.isOpen = false;
      }
    };

    if (!isBrowser) {
      return;
    }
    window.addEventListener('keydown', handleKeyPress);

    cleanup(() => {
      window.removeEventListener('keydown', handleKeyPress);
    });
  });

  useTask$(({ track, cleanup }) => {
    track(() => interactionMode.value);

    if (!interactionMode.value || !isBrowser) {
      return;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopInteraction);
    window.addEventListener('blur', stopInteraction);

    cleanup(() => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopInteraction);
      window.removeEventListener('blur', stopInteraction);
      resetPointerStyles();
    });
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => props.state.isOpen);
    track(() => props.state.isPanelFullscreen);

    if (!props.state.isOpen) {
      return;
    }

    if (!props.state.isPanelFullscreen) {
      updatePanelBounds(
        panelBounds,
        props.state,
        hasValidBounds(props.state.panelBounds)
          ? normalizeBounds(props.state.panelBounds)
          : createDefaultBounds()
      );
    }

    const handleWindowResize = () => {
      if (props.state.isPanelFullscreen) {
        return;
      }
      updatePanelBounds(
        panelBounds,
        props.state,
        hasValidBounds(panelBounds.value)
          ? normalizeBounds(panelBounds.value)
          : createDefaultBounds()
      );
    };

    window.addEventListener('resize', handleWindowResize);

    cleanup(() => {
      window.removeEventListener('resize', handleWindowResize);
      resetPointerStyles();
    });
  });

  const hasBounds = hasValidBounds(panelBounds.value);
  const panelStyle = props.state.isPanelFullscreen
    ? FULLSCREEN_PANEL_STYLE
    : hasBounds
      ? {
          left: `${panelBounds.value.x}px`,
          top: `${panelBounds.value.y}px`,
          width: `${panelBounds.value.width}px`,
          height: `${panelBounds.value.height}px`,
        }
      : {
          right: `${WINDOW_MARGIN}px`,
          bottom: `${WINDOW_MARGIN}px`,
          width: `min(calc(100vw - ${WINDOW_MARGIN * 2}px), ${DEFAULT_WIDTH}px)`,
          height: `min(calc(100vh - ${WINDOW_MARGIN * 2}px), ${DEFAULT_HEIGHT}px)`,
        };

  return (
    <>
      <div
        class="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onMouseDown$={() => {
          props.state.isOpen = false;
        }}
      />

      <div
        class={[
          'glass-panel text-foreground fixed z-[9991] flex overflow-hidden border transition-[border-radius,width,height,left,top]',
          interactionMode.value ? 'duration-0' : 'duration-200 ease-out',
          props.state.isPanelFullscreen ? 'inset-0 rounded-none' : 'rounded-2xl shadow-2xl',
        ]}
        style={panelStyle}
        onMouseDown$={(event) => {
          event.stopPropagation();
        }}
      >
        {!props.state.isPanelFullscreen && (
          <>
            <button
              type="button"
              aria-label="Resize north"
              class="absolute inset-x-4 top-0 z-20 h-2 cursor-ns-resize"
              onMouseDown$={(event) => handleResizeStart('n', event)}
            />
            <button
              type="button"
              aria-label="Resize south"
              class="absolute inset-x-4 bottom-0 z-20 h-2 cursor-ns-resize"
              onMouseDown$={(event) => handleResizeStart('s', event)}
            />
            <button
              type="button"
              aria-label="Resize east"
              class="absolute top-4 right-0 bottom-4 z-20 w-2 cursor-ew-resize"
              onMouseDown$={(event) => handleResizeStart('e', event)}
            />
            <button
              type="button"
              aria-label="Resize west"
              class="absolute top-4 bottom-4 left-0 z-20 w-2 cursor-ew-resize"
              onMouseDown$={(event) => handleResizeStart('w', event)}
            />
            <button
              type="button"
              aria-label="Resize northwest"
              class="absolute top-0 left-0 z-20 h-4 w-4 cursor-nwse-resize"
              onMouseDown$={(event) => handleResizeStart('nw', event)}
            />
            <button
              type="button"
              aria-label="Resize northeast"
              class="absolute top-0 right-0 z-20 h-4 w-4 cursor-nesw-resize"
              onMouseDown$={(event) => handleResizeStart('ne', event)}
            />
            <button
              type="button"
              aria-label="Resize southwest"
              class="absolute bottom-0 left-0 z-20 h-4 w-4 cursor-nesw-resize"
              onMouseDown$={(event) => handleResizeStart('sw', event)}
            />
            <button
              type="button"
              aria-label="Resize southeast"
              class="absolute right-0 bottom-0 z-20 h-4 w-4 cursor-nwse-resize"
              onMouseDown$={(event) => handleResizeStart('se', event)}
            />
          </>
        )}

        <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            class={[
              'border-glass-border/80 flex items-center justify-between border-b px-4 py-3',
              props.state.isPanelFullscreen ? 'cursor-default' : 'cursor-grab',
            ]}
            onMouseDown$={handleDragStart}
            onDblClick$={handleToggleFullscreen}
          >
            <div class="flex min-w-0 items-center gap-3">
              <img
                width={20}
                height={20}
                src="https://qwik.dev/logos/qwik-logo.svg"
                alt="Qwik Logo"
                class="h-5 w-5 shrink-0"
                draggable={false}
              />
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold">Qwik DevTools</div>
                <div class="text-muted-foreground truncate text-xs">
                  {props.state.isPanelFullscreen
                    ? 'Fullscreen mode'
                    : 'Drag the title bar or resize from any edge'}
                </div>
              </div>
            </div>

            <div
              class="flex items-center gap-2"
              onMouseDown$={(event) => {
                event.stopPropagation();
              }}
            >
              <button
                type="button"
                aria-label={props.state.isPanelFullscreen ? 'Restore window' : 'Enter fullscreen'}
                class="bg-card-item-bg hover:bg-card-item-hover-bg border-glass-border text-muted-foreground hover:text-foreground flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95"
                onClick$={handleToggleFullscreen}
              >
                {props.state.isPanelFullscreen ? (
                  <IconArrowsPointingIn class="h-4 w-4" />
                ) : (
                  <IconArrowsPointingOut class="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                aria-label="Close devtools"
                class="bg-card-item-bg hover:bg-card-item-hover-bg border-glass-border text-muted-foreground hover:text-foreground flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-95"
                onClick$={() => {
                  props.state.isOpen = false;
                }}
              >
                <IconXMark class="h-5 w-5" />
              </button>
            </div>
          </div>

          <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <Slot />
          </div>
        </div>
      </div>
    </>
  );
});
