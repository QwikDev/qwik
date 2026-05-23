import {
  getAsyncResourcePayloadSnapshotForServer,
  getAsyncResourceStateSnapshotForServer,
  getCacheRegistrySnapshotForServer,
} from '../../runtime/src/server-function-cache';
import type { RequestEvent } from './types';

export type ComponentPartialPayloadMode = 'html' | 'data-plus-render-symbol';

type ComponentPartialResumeMetadata = {
  boundary: 'standalone-container';
  merge: 'none';
  reason: string;
};

const COMPONENT_PARTIAL_RESUME_METADATA: ComponentPartialResumeMetadata = {
  boundary: 'standalone-container',
  merge: 'none',
  reason:
    'qcomponent HTML carries container-scoped Qwik state/vnode metadata and is not a raw in-page subtree merge payload.',
};

export const getComponentRequestProps = (data: unknown) => {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'props' in data) {
    return (data as { props?: unknown }).props ?? {};
  }
  return data ?? {};
};

export const getComponentPartialPayloadMode = (
  ev: RequestEvent,
  data: unknown
): ComponentPartialPayloadMode => {
  const queryMode = ev.query.get('qcomponent-payload') ?? ev.query.get('qcomponent-mode');
  if (queryMode === 'data' || queryMode === 'data-plus-render-symbol') {
    return 'data-plus-render-symbol';
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const componentRequest = data as { payload?: unknown; payloadMode?: unknown };
    const payloadMode = componentRequest.payloadMode ?? componentRequest.payload;
    if (payloadMode === 'data' || payloadMode === 'data-plus-render-symbol') {
      return 'data-plus-render-symbol';
    }
  }
  return 'html';
};

export const isComponentJsonRequest = (
  ev: RequestEvent,
  data: unknown,
  payloadMode: ComponentPartialPayloadMode
) => {
  if (payloadMode !== 'html') {
    return true;
  }
  if (ev.query.get('qcomponent-format') === 'json') {
    return true;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const format = (data as { format?: unknown }).format;
    if (format === 'json') {
      return true;
    }
  }
  return acceptsJson(ev.request.headers.get('accept'));
};

export const createComponentPartialEnvelope = (
  ev: RequestEvent,
  componentId: string,
  result: { html: string; cacheStatus: 'hit' | 'miss' | 'skip' },
  payloadMode: ComponentPartialPayloadMode
) => {
  const component = getComponentPartialMetadata(componentId);
  const resources = getAsyncResourceStateSnapshotForServer(ev).map((state) => ({
    qrlHash: state.qrlHash,
    status: state.status,
    source: state.source,
  }));
  const base = {
    type: 'qwik-component-partial',
    version: 1,
    standalone: true,
    mode: payloadMode,
    component,
    cache: {
      status: result.cacheStatus,
    },
    resume: COMPONENT_PARTIAL_RESUME_METADATA,
    resources,
  };
  if (payloadMode === 'data-plus-render-symbol') {
    return {
      ...base,
      render: getComponentPartialRenderMetadata(componentId),
      data: {
        resources: getAsyncResourcePayloadSnapshotForServer(ev),
      },
    };
  }
  return {
    ...base,
    html: result.html,
  };
};

const getComponentPartialMetadata = (componentId: string) => {
  const entry = getCacheRegistrySnapshotForServer().components.find((component) =>
    component.ids.includes(componentId)
  );
  return {
    id: componentId,
    ...(entry ? { name: entry.name } : {}),
    ...(entry?.registry
      ? {
          registry: {
            id: entry.registry.id,
            qrlHash: entry.registry.qrlHash,
            symbol: entry.registry.symbol,
          },
        }
      : {}),
  };
};

const getComponentPartialRenderMetadata = (componentId: string) => {
  const entry = getCacheRegistrySnapshotForServer().components.find((component) =>
    component.ids.includes(componentId)
  );
  return {
    componentId,
    ids: entry?.ids ?? [componentId],
    ...(entry?.registry
      ? {
          registry: {
            id: entry.registry.id,
            qrlHash: entry.registry.qrlHash,
            symbol: entry.registry.symbol,
          },
        }
      : {}),
  };
};

const acceptsJson = (accept: string | null) => {
  return !!accept
    ?.split(',')
    .some((part) => part.trim().toLowerCase().startsWith('application/json'));
};
