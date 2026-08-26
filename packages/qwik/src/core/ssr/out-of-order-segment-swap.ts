import type { OutOfOrderRevealBoundary } from '../control-flow/suspense-utils';
import { QSuspenseResolved } from '../shared/utils/markers';
import type { SSRContainer, SSROutOfOrderSegment } from './ssr-types';

/** Finalizes a deferred segment and emits its swap scripts; shared by Suspense and ErrorBoundary. */
export async function finalizeAndSwapOutOfOrderSegment(
  ssr: SSRContainer,
  boundaryId: number,
  rendered: SSROutOfOrderSegment,
  revealBoundary: OutOfOrderRevealBoundary | null
): Promise<void> {
  const segmentId = String(boundaryId);
  const result = await rendered.container.$finalizeOutOfOrderSegment$(segmentId, rendered);
  ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"${revealBoundary?.attrs ?? ''}>`);
  ssr.write(result.html);
  ssr.write('</template>');
  ssr.emitOutOfOrderSegmentScripts(result.scripts);
  ssr.emitOutOfOrderExecutorIfNeeded();
  ssr.emitInlineScript(`qO(${boundaryId})`);
  const errorSwapIds = rendered.container.$errorSwapIds$;
  if (__EXPERIMENTAL__.errorBoundary && errorSwapIds?.length) {
    ssr.emitErrorSwapExecutorIfNeeded();
    for (let i = 0; i < errorSwapIds.length; i++) {
      ssr.emitInlineScript(`qErr(${errorSwapIds[i]})`);
    }
  }
  // qO() is the browser-visible handoff for this segment, so flush it immediately.
  await ssr.streamHandler.flush();
}
