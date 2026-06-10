export const QWIK_DEVTOOLS_GLOBAL = {
  key: '__QWIK_DEVTOOLS__',
  version: 1,
  props: {
    componentState: 'componentState',
    hook: 'hook',
    pageDataSource: 'pageDataSource',
    dataProvider: 'dataProvider',
    perf: 'perf',
    preloads: 'preloads',
    ssrPreloads: 'ssrPreloads',
  },
  ssr: {
    perfStore: '__QWIK_SSR_PERF__',
    preloadsProcessStore: '__QWIK_SSR_PRELOADS__',
    perfId: '__QWIK_SSR_PERF_ID__',
    perfIndex: '__QWIK_SSR_PERF_INDEX__',
    perfCount: '__QWIK_SSR_PERF_COUNT__',
  },
} as const;
