import { isPromise, maybeThen } from '../shared/utils/promises';
import { isDev } from '@qwik.dev/core/build';
import type { ValueOrPromise } from '../shared/utils/types';
import type { UseOnEvent, UseOnMap } from '../runtime/use-on';
import { EventNameHtmlScope, getEventDataFromHtmlAttribute } from '../shared/utils/event-names';
import {
  createSsrOpenTag,
  isSsrEventAttrChunk,
  isSsrRecordChunk,
  type SsrEventAttrChunk,
  type SsrOutput,
  type SsrRecordPart,
} from './output';

export function applyUseOnToSsrOutput(
  output: SsrOutput,
  useOnEvents: UseOnMap,
  eventAttr: (name: string, value: unknown) => SsrEventAttrChunk
): SsrOutput {
  const result = maybeThen(applyToFirstElement(output, useOnEvents, eventAttr), (applied) =>
    applied.found ? applied.output : appendCarrier(output, useOnEvents, eventAttr)
  );
  return isPromise(result) ? Promise.resolve(result) : result;
}

function appendCarrier(
  output: SsrOutput,
  useOnEvents: UseOnMap,
  eventAttr: (name: string, value: unknown) => SsrEventAttrChunk
): SsrOutput {
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
    { ...createSsrOpenTag(...parts), headlessCarrier: true },
    '</script>',
  ];
  return Array.isArray(output) ? [...output, placeholder] : [output, placeholder];
}

function applyToFirstElement(
  output: SsrOutput,
  useOnEvents: UseOnMap,
  eventAttr: (name: string, value: unknown) => SsrEventAttrChunk
): ValueOrPromise<{ output: SsrOutput; found: boolean }> {
  if (isPromise(output)) {
    return output.then((resolved) => applyToFirstElement(resolved, useOnEvents, eventAttr));
  }
  if (Array.isArray(output)) {
    const replace = (i: number, child: { output: SsrOutput; found: boolean }) => {
      const children = output.slice();
      children[i] = child.output;
      return { output: children, found: true };
    };
    const scan = (start: number): ValueOrPromise<{ output: SsrOutput; found: boolean }> => {
      for (let i = start; i < output.length; i++) {
        const child = applyToFirstElement(output[i], useOnEvents, eventAttr);
        if (isPromise(child)) {
          return child.then((child) => (child.found ? replace(i, child) : scan(i + 1)));
        }
        if (child.found) {
          return replace(i, child);
        }
      }
      return { output, found: false };
    };
    return scan(0);
  }
  if (!isSsrRecordChunk(output) || !output.openTag) {
    return { output, found: false };
  }
  const parts = output.parts.slice();
  const isScript = parts[0] === '<script';
  for (const key in useOnEvents) {
    // A script never intersects: its visible task wakes with the document instead.
    const eventKey = key === 'q-e:qvisible' && isScript ? 'q-d:qinit' : key;
    appendEvent(parts, eventAttr(eventKey, useOnEvents[key].qrls), useOnEvents[key]);
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
