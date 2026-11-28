const ROUTER_CHUNK_NAME = 'qwik-router';

const ROUTER_RUNTIME_MODULE =
  /[/\\](?:qwik-router|@qwik\.dev[/\\]router)[/\\]lib[/\\](?:index\.qwik\.mjs|chunks[/\\])|@qwik-router-config$/;

const LOADED_ON_DEMAND = /_(?:serverQrl|QwikRouterMockProvider|useQwikMockRouter)_/;

export const getRouterChunkName = (moduleId: string): string | null =>
  ROUTER_RUNTIME_MODULE.test(moduleId) && !LOADED_ON_DEMAND.test(moduleId)
    ? ROUTER_CHUNK_NAME
    : null;
