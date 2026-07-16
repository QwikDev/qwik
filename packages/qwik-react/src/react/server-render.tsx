import { jsx, Slot, isServer, type QRL, type Signal } from '@qwik.dev/core';
import { SSRComment, SSRRaw, SSRStream } from '@qwik.dev/core/internal';
import { renderToString } from 'react-dom/server';
import {
  getHostProps,
  getReactProps,
  mainExactProps,
  setSSRProjectionRegistry,
  type SSRProjectionRegistry,
} from './slot';

const SLOT_MARKER = '<!--SLOT-->';

interface HtmlSegment {
  type: 'html';
  content: string;
}
interface SlotSegment {
  type: 'slot';
}
interface ProjSegment {
  type: 'proj';
  slotName: string;
}
type Segment = HtmlSegment | SlotSegment | ProjSegment;

function splitHtmlAtMarkers(html: string): Segment[] {
  const MARKER_RE = /<!--(?:SLOT|QWIK-PROJ:(.*?))-->/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = MARKER_RE.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'proj', slotName: match[1] });
    } else {
      segments.push({ type: 'slot' });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    segments.push({ type: 'html', content: html.slice(lastIndex) });
  }

  return segments;
}

export async function renderFromServer(
  Host: any,
  reactCmp$: QRL<any>,
  scopeId: string,
  props: Record<string, any>,
  ref: Signal<Element | undefined>,
  slotRef: Signal<Element | undefined>,
  hydrationProps: Record<string, any>
) {
  if (isServer) {
    const Cmp = await reactCmp$.resolve();

    const newProps = getReactProps(props);
    Object.assign(hydrationProps, newProps);

    // Set up projection registry so reactify$ components can register during renderToString
    const registry: SSRProjectionRegistry = { entries: new Map() };
    setSSRProjectionRegistry(registry);
    const html = renderToString(mainExactProps(undefined, scopeId, Cmp, newProps));
    setSSRProjectionRegistry(null);

    const hasSlot = html.includes(SLOT_MARKER);
    const hasProj = registry.entries.size > 0;

    if (hasSlot || hasProj) {
      const segments = splitHtmlAtMarkers(html);
      return (
        <>
          <Host ref={ref} {...getHostProps(props)}>
            <SSRStream>
              {async function* () {
                yield <SSRComment data="q:ignore" />;
                for (const segment of segments) {
                  if (segment.type === 'html') {
                    yield <SSRRaw data={segment.content} />;
                  } else if (segment.type === 'slot') {
                    yield <SSRComment data="q:container-island" />;
                    yield (
                      <q-slot ref={slotRef}>
                        <Slot />
                      </q-slot>
                    );
                    yield <SSRComment data="/q:container-island" />;
                  } else if (segment.type === 'proj') {
                    const entry = registry.entries.get(segment.slotName);
                    if (entry) {
                      yield <SSRComment data="q:container-island" />;
                      const QwikComp = await entry.qrl.resolve();
                      yield jsx(QwikComp, entry.props);
                      yield <SSRComment data="/q:container-island" />;
                    }
                  }
                }
                yield <SSRComment data="/q:ignore" />;
              }}
            </SSRStream>
          </Host>
          {!hasSlot && (
            <q-slot ref={slotRef}>
              <Slot />
            </q-slot>
          )}
        </>
      );
    }

    return (
      <>
        <Host ref={ref}>
          <SSRComment data="q:container=html" />
          <SSRRaw data={html}></SSRRaw>
          <SSRComment data="/q:container" />
        </Host>
        <q-slot ref={slotRef}>
          <Slot />
        </q-slot>
      </>
    );
  }
}
