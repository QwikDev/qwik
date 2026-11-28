import { component$, useVisibleTask$ } from '@qwik.dev/core';
import { getQwikDevtoolsGlobal, QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import { isExcludedPathname, normalizeExcludePathnames } from '../../../kit/src/overlay-paths';
import { ensurePreloadRuntime } from '../runtime/preloads';

export function initializePageCollection(excludePathnames: string[]) {
  if (
    !isExcludedPathname(location.pathname, excludePathnames) &&
    !getQwikDevtoolsGlobal(window)?.[QWIK_DEVTOOLS_GLOBAL.props.dataProvider]
  ) {
    ensurePreloadRuntime();
  }
}

export const QwikDevtoolsCollector = component$<{ excludePathnames?: string[] }>((props) => {
  const excludePathnames = normalizeExcludePathnames(props.excludePathnames);
  useVisibleTask$(() => initializePageCollection(excludePathnames), {
    strategy: 'document-ready',
  });
  return <span style={{ display: 'contents' }} />;
});
