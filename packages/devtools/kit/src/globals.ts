import { ViteDevServer } from 'vite';
import { ClientRpc, ParsedStructure, ServerRpc } from './types';
import type { QwikDevtoolsHook } from './hook-types';

interface EventEmitter {
  on: (name: string, handler: (data: any) => void) => void;
  send: (name: string, ...args: any[]) => void;
}

export interface ViteClientContext extends EventEmitter {}
export type ViteServerContext = ViteDevServer;

export const CLIENT_CTX = '__qwik_client_ctx__';
export const SERVER_CTX = '__qwik_server_ctx__';
export const SERVER_RPC = '__qwik_server_rpc__';
export const CLIENT_RPC = '__qwik_client_rpc__';

// Devtools global state types
export type QwikPerfPhaseRemembered = 'ssr' | 'csr';

export interface QwikPerfErrorRemembered {
  name: string;
  message: string;
}

export interface QwikPerfEntryRemembered {
  id: number;
  component: string;
  phase: QwikPerfPhaseRemembered;
  duration: number;
  start: number;
  end: number;
  error?: QwikPerfErrorRemembered;
  /** Present for wrapped `_component_` render-function modules; helps de-dupe. */
  viteId?: string;
  /** Present for wrapped `_component_` render-function modules. */
  renderCount?: number;
}

export interface QwikPerfStoreRemembered {
  ssr: QwikPerfEntryRemembered[];
  csr: QwikPerfEntryRemembered[];
}

export type QwikPreloadStatus = 'pending' | 'loaded' | 'error' | 'unknown';
export type QwikPreloadSource = 'initial-dom' | 'mutation' | 'performance' | 'qrl-correlation';
export type QwikPreloadOriginKind =
  | 'current-project'
  | 'vite-plugin-injected'
  | 'node_modules'
  | 'virtual-module'
  | 'generated'
  | 'external'
  | 'unknown';
export type QwikPreloadPhase = 'csr' | 'ssr' | 'unknown';
export type QwikPreloadMatchMode =
  | 'href'
  | 'normalized-href'
  | 'chunk-hash'
  | 'resource-name'
  | 'none';
export type QwikPreloadLoadMatchQuality = 'best-effort' | 'none';

export interface QwikPreloadQrlRequestRemembered {
  symbol: string;
  href?: string;
  normalizedHref?: string;
  requestedAt: number;
  originKind?: QwikPreloadOriginKind;
  phase?: QwikPreloadPhase;
  matchedEntryId?: number;
}

export interface QwikPreloadEntryRemembered {
  id: number;
  href: string;
  normalizedHref: string;
  rel: string;
  as: string;
  resourceType: string;
  status: QwikPreloadStatus;
  source: QwikPreloadSource;
  originKind: QwikPreloadOriginKind;
  phase: QwikPreloadPhase;
  discoveredAt: number;
  requestedAt?: number;
  completedAt?: number;
  importDuration?: number;
  loadDuration?: number;
  duration?: number;
  transferSize?: number;
  decodedBodySize?: number;
  initiatorType?: string;
  qrlSymbol?: string;
  qrlRequestedAt?: number;
  qrlToLoadDuration?: number;
  loadMatchQuality?: QwikPreloadLoadMatchQuality;
  matchedBy: QwikPreloadMatchMode;
  error?: string;
}

export type QwikSsrPreloadSnapshotRemembered = Partial<QwikPreloadEntryRemembered> &
  Pick<QwikPreloadEntryRemembered, 'href'>;

export interface QwikPreloadStoreRemembered {
  entries: QwikPreloadEntryRemembered[];
  qrlRequests: QwikPreloadQrlRequestRemembered[];
  startedAt: number;
  clear: () => void;
  _id: number;
  _initialized: boolean;
  _byHref: Record<string, number>;
  _byId: Record<number, QwikPreloadEntryRemembered>;
}

export interface DevtoolsRenderStats {
  /**
   * In-memory performance store written by devtools instrumentation. (Populated at runtime;
   * optional in types.)
   */
  perf?: QwikPerfStoreRemembered;
}
export interface ComponentDevtoolsState {
  hooks: ParsedStructure[];
  stats: DevtoolsRenderStats;
}

declare global {
  interface Window {
    QWIK_DEVTOOLS_GLOBAL_STATE?: Record<string, ComponentDevtoolsState>;
    /**
     * Performance store (CSR + injected SSR snapshot). Written by `@devtools/plugin`
     * instrumentation.
     */
    __QWIK_PERF__?: QwikPerfStoreRemembered;
    __QWIK_PRELOADS__?: QwikPreloadStoreRemembered;
    __QWIK_SSR_PRELOADS__?: QwikSsrPreloadSnapshotRemembered[];
    /**
     * Runtime devtools hook installed by `@devtools/plugin` in dev mode. Provides structured
     * signal/component/render inspection for the browser extension and in-app overlay.
     */
    __QWIK_DEVTOOLS_HOOK__?: QwikDevtoolsHook;
  }
}

declare global {
  // SSR collector lives on `process` (preferred) or `globalThis` via dynamic properties.
  // We type the `process` case here to avoid `any` in plugin code.
  namespace NodeJS {
    interface Process {
      __QWIK_SSR_PERF__?: QwikPerfEntryRemembered[];
      __QWIK_SSR_PRELOADS__?: QwikSsrPreloadSnapshotRemembered[];
      __QWIK_SSR_PERF_SET__?: Set<string>;
      __QWIK_SSR_PERF_ID__?: number;
      __QWIK_SSR_PERF_INDEX__?: Record<string, number>;
    }
  }
}
