import {
  component$,
  useSignal,
  $,
  useComputed$,
  useStore,
  useTask$,
  useStyles$,
  useOnDocument,
  type QwikMouseEvent,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { type Callout, getCallout } from './callout';
import { setPosition } from './layers';
import { srcLayer0, srcLayer1, srcLayer2 } from './syntax';
import STYLES from './src-animation.css?inline';

export const SrcAnimation = component$(() => {
  useStyles$(STYLES);
  const stickyDiv = useSignal<HTMLDivElement>();
  const calloutStyles = useSignal<Record<string, any>>({ display: 'none' });
  const hoverToken = useStore<{
    element: HTMLSpanElement | null;
    callout: Callout | null;
  }>({
    element: null,
    callout: null,
  });
  const position = useSignal(0);
  const inter = useComputed$(() => {
    return setPosition(position.value);
  });
  const transform2 = useComputed$(() =>
    [
      `rotateX(${inter.value.rotateX}deg)`,
      `rotateY(${inter.value.rotateY}deg)`,
      `rotateZ(${inter.value.rotateZ}deg)`,
      `translateX(${inter.value.translateX}px)`,
      `translateY(${inter.value.translateY}px)`,
      `translateZ(${inter.value.translateZ}px)`,
    ].join(' ')
  );
  const transform1 = useComputed$(() =>
    [
      `rotateX(${inter.value.rotateX}deg)`,
      `rotateY(${inter.value.rotateY}deg)`,
      `rotateZ(${inter.value.rotateZ}deg)`,
    ].join(' ')
  );
  const transform0 = useComputed$(() =>
    [
      `rotateX(${inter.value.rotateX}deg)`,
      `rotateY(${inter.value.rotateY}deg)`,
      `rotateZ(${inter.value.rotateZ}deg)`,
      `translateX(${-inter.value.translateX}px)`,
      `translateY(${-inter.value.translateY}px)`,
      `translateZ(${-inter.value.translateZ}px)`,
    ].join(' ')
  );
  useTask$(({ track }) => {
    track(hoverToken);
    if (!isBrowser) {
      return;
    }
    if (hoverToken.callout) {
      const rect = hoverToken.element!.getBoundingClientRect();
      const top = rect.bottom + window.scrollY;
      const left = rect.left + window.scrollX;
      calloutStyles.value = {
        display: 'block',
        position: 'absolute',
        top: top + 'px',
        left: left + 'px',
        zIndex: '2',
      };
    } else {
      calloutStyles.value = {
        display: 'none',
      };
    }
  });
  useOnDocument(
    'scroll',
    $((e) => {
      const stickyParent = stickyDiv.value!.parentElement!;
      const rectParent = stickyParent.getBoundingClientRect();
      const rectSticky = stickyDiv.value!.getBoundingClientRect();
      const scrollY = window.scrollY;
      const height = rectParent.height - rectSticky.height;
      const start = scrollY + rectParent.top;
      // const end = start + height;
      const pos = Math.max(0, Math.min(1, (scrollY - start) / height));
      position.value = pos;
      hoverToken.element = null;
      hoverToken.callout = null;
    })
  );

  return (
    <>
      <div class="sticky" ref={stickyDiv}>
        <ul
          class="layers"
          style={{
            '--layer-alpha': inter.value.layerAlpha,
            '--opacity': inter.value.opacity,
          }}
          onMouseMove$={(e) => {
            const spans = stickyDiv.value!.querySelectorAll('span.callout-anchor')!;
            let found = false;
            for (let i = 0; i < spans.length; i++) {
              const span = spans[i] as HTMLSpanElement;
              const rect = span.getBoundingClientRect();
              if (inside(e, rect)) {
                found = true;
                hoverToken.element = span;
                const hoverText = span.textContent;
                const nextText = span.nextSibling?.textContent;
                hoverToken.callout = getCallout(hoverText, nextText);
              }
            }
            if (!found) {
              hoverToken.element = null;
              hoverToken.callout = null;
            }
          }}
        >
          <li
            class="layer layer-0"
            style={{
              marginLeft: -1 * inter.value.marginLeft + 'px',
              marginTop: -1 * inter.value.marginTop + 'px',
            }}
          >
            <div
              dangerouslySetInnerHTML={srcLayer0}
              style={{
                transform: transform2.value,
              }}
            />
          </li>
          <li class="layer layer-1">
            <div
              style={{
                transform: transform1.value,
              }}
              dangerouslySetInnerHTML={srcLayer1}
            />
          </li>
          <li
            class="layer layer-2"
            style={{
              marginLeft: 1 * inter.value.marginLeft + 'px',
              marginTop: 1 * inter.value.marginTop + 'px',
            }}
          >
            <div
              style={{
                transform: transform0.value,
              }}
              dangerouslySetInnerHTML={srcLayer2}
            />
          </li>
        </ul>
      </div>
      <div
        class="callout"
        style={calloutStyles.value}
        dangerouslySetInnerHTML={hoverToken.callout?.html}
      />
    </>
  );
});

function inside(pos: QwikMouseEvent, rect: DOMRect) {
  const { x, y } = pos;
  const { left, right, top, bottom } = rect;
  return left < x && x < right && top < y && y < bottom;
}
