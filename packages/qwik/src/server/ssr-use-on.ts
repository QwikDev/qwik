import { isDev } from '@qwik.dev/core/build';
import {
  createSsrElementRecord,
  isSsrEventAttrChunk,
  isSsrRecordChunk,
  type SsrEventAttrChunk,
  type SsrOutput,
  type SsrRecordPart,
  type UseOnEvent,
  type UseOnMap,
} from '@qwik.dev/core';
import { EventNameHtmlScope, getEventDataFromHtmlAttribute } from './qwik-copy';

export function applyUseOnToSsrOutput(
  output: SsrOutput,
  useOnEvents: UseOnMap,
  eventAttr: (name: string, value: unknown) => SsrEventAttrChunk
): SsrOutput {
  const applied = applyToFirstElement(output, useOnEvents, eventAttr);
  if (applied.found) {
    return applied.output;
  }

  const parts: SsrRecordPart[] = ['<script hidden', '>'];
  let hasCarrier = false;
  for (const key in useOnEvents) {
    if (
      key !== 'q-e:qvisible' &&
      !key.startsWith(EventNameHtmlScope.document) &&
      !key.startsWith(EventNameHtmlScope.window)
    ) {
      if (isDev) {
        console.warn(`useOn('${key}') has no element carrier.`);
      }
      continue;
    }
    const event = useOnEvents[key];
    const eventKey = key === 'q-e:qvisible' ? 'q-d:qinit' : key;
    appendEvent(parts, eventAttr(eventKey, event.qrls), event);
    hasCarrier = true;
  }
  if (!hasCarrier) {
    return output;
  }
  const placeholder: SsrOutput = [
    { ...createSsrElementRecord('script', ...parts), headlessCarrier: true },
    '</script>',
  ];
  return Array.isArray(output) ? [...output, placeholder] : [output, placeholder];
}

function applyToFirstElement(
  output: SsrOutput,
  useOnEvents: UseOnMap,
  eventAttr: (name: string, value: unknown) => SsrEventAttrChunk
): { output: SsrOutput; found: boolean } {
  if (Array.isArray(output)) {
    for (let i = 0; i < output.length; i++) {
      const child = applyToFirstElement(output[i], useOnEvents, eventAttr);
      if (child.found) {
        const children = output.slice();
        children[i] = child.output;
        return { output: children, found: true };
      }
    }
    return { output, found: false };
  }
  if (!isSsrRecordChunk(output) || output.element === undefined) {
    return { output, found: false };
  }
  const parts = output.parts.slice();
  for (const key in useOnEvents) {
    appendEvent(parts, eventAttr(key, useOnEvents[key].qrls), useOnEvents[key]);
  }
  return { output: { ...output, parts }, found: true };
}

function appendEvent(parts: SsrRecordPart[], chunk: SsrEventAttrChunk, event: UseOnEvent): void {
  if (chunk.valueParts.length > 0) {
    const existingIndex = parts.findIndex(
      (part) => isSsrEventAttrChunk(part) && part.name === chunk.name
    );
    if (existingIndex === -1) {
      parts.splice(parts.length - 1, 0, chunk);
    } else {
      const existing = parts[existingIndex] as SsrEventAttrChunk;
      parts[existingIndex] = {
        ...existing,
        valueParts: [...existing.valueParts, '|', ...chunk.valueParts],
      };
    }
  }
  const [, eventName] = getEventDataFromHtmlAttribute(chunk.name);
  event.capture && parts.splice(parts.length - 1, 0, ` capture:${eventName}`);
  event.preventdefault && parts.splice(parts.length - 1, 0, ` preventdefault:${eventName}`);
  event.stoppropagation && parts.splice(parts.length - 1, 0, ` stoppropagation:${eventName}`);
}
