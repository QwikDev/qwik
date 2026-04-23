import { type ViteDevServer, type ResolvedConfig } from 'vite';

export interface ServerContext {
  server: ViteDevServer;
  config: ResolvedConfig;
  qwikData: Map<string, any>;
}
