export const DEVTOOLS_MESSAGES = {
  pageSource: 'qwik-devtools',
  viteMessagingEvent: 'qwik_tools:vite_messaging_event',
  types: {
    render: 'RENDER_EVENT',
    componentTreeUpdate: 'COMPONENT_TREE_UPDATE',
  },
  events: {
    preloadsUpdate: 'qwik:preloads-update',
    ssrPerf: 'qwik:ssr-perf',
    ssrPreloads: 'qwik:ssr-preloads',
  },
} as const;

export interface QwikDevtoolsPageMessage<TType extends string = string, TPayload = unknown> {
  source: typeof DEVTOOLS_MESSAGES.pageSource;
  type: TType;
  event?: TPayload;
  tree?: TPayload;
}
