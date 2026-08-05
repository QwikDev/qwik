/*
 * WHAT IS THIS FILE?
 *
 * Browser extension entry point using client-side rendering only.
 * The extension panel runs inside the DevTools panel, so we render
 * into the document element directly (same as entry.dev.tsx).
 *
 * Data is loaded via the DataProvider abstraction instead of Vite
 * HMR RPC. Page-level data (perf, preloads) is accessed via the
 * PageDataSource abstraction. Both are injected before mounting.
 */
import { render, type RenderOptions } from '@qwik.dev/core';
import { getOrCreateQwikDevtoolsGlobal, QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import type { DataProvider } from './devtools/data-provider';
import type { PageDataSource } from './devtools/page-data-source';
import { QwikDevtoolsExtension } from './devtools/QwikDevtoolsExtension';

export interface ExtensionMountOptions {
  renderOptions: RenderOptions;
  dataProvider?: DataProvider;
  pageDataSource?: PageDataSource;
}

/**
 * Browser extension entry point using client-side rendering only.
 *
 * Mounts the extension-specific devtools layout (no overlay chrome) directly into the document.
 * Data is loaded via the injected DataProvider and PageDataSource.
 */
export default async function (opts: ExtensionMountOptions) {
  const devtoolsGlobal = getOrCreateQwikDevtoolsGlobal(window);
  if (opts.dataProvider) {
    devtoolsGlobal[QWIK_DEVTOOLS_GLOBAL.props.dataProvider] = opts.dataProvider;
  }
  if (opts.pageDataSource) {
    devtoolsGlobal[QWIK_DEVTOOLS_GLOBAL.props.pageDataSource] = opts.pageDataSource;
  }
  return render(document, <QwikDevtoolsExtension />, opts.renderOptions);
}
