import type { NoSerialize, Signal } from '@qwik.dev/core';
import type {
  Diagnostic,
  QwikManifest,
  QwikRollupPluginOptions,
  TransformModule,
} from '@qwik.dev/core/optimizer';
import type { ReplInstance } from './repl-instance';

export interface ReplAppInput {
  files: ReplModuleInput[];
  version: string;
  buildMode: 'development' | 'production';
  entryStrategy: string;
  debug?: boolean;
}

export type PkgUrls = { [pkgName: string]: { [path: string]: string; version: string } };
export interface ReplInputOptions extends Omit<QwikRollupPluginOptions, 'srcDir'> {
  replId: string;
  srcInputs: ReplModuleInput[];
  version: string;
  buildMode: 'development' | 'production';
  debug?: boolean;
}

export interface ReplStore {
  replId: string;
  html: string;
  transformedModules: TransformModule[];
  clientBundles: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  diagnostics: Diagnostic[];
  monacoDiagnostics: Diagnostic[];
  selectedInputPath: string;
  selectedOutputPanel: OutputPanel;
  selectedOutputDetail: OutputDetail;
  enableHtmlOutput: boolean;
  enableClientOutput: boolean;
  enableSsrOutput: boolean;
  ssrBuild: boolean;
  debug: boolean;
  versions: string[];
  events: ReplEvent[];
  isLoading: boolean;
  reload: number;
  instance: NoSerialize<ReplInstance> | null;
}

export interface ReplModuleInput {
  path: string;
  code: string;
  hidden?: boolean;
}

export interface ReplModuleOutput {
  path: string;
  code: string;
  size?: string;
  shorten?: Signal<boolean>;
}

export interface ReplEvent {
  start: number;
  end?: number;
  kind:
    | 'console-log'
    | 'console-debug'
    | 'console-warn'
    | 'console-error'
    | 'symbol'
    | 'pause'
    | 'resume'
    | 'client-module'
    | 'prefetch';
  scope: 'ssr' | 'client' | 'build' | 'network';
  message: string[];
  element?: Element;
}

export interface ReplResult {
  buildId: number;
  html: string;
  transformedModules: TransformModule[];
  clientBundles: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  manifest: QwikManifest | undefined;
  diagnostics: Diagnostic[];
  events: ReplEvent[];
}

export interface ReplMessageBase {
  type: string;
  clientId: string;
}

// SSR Worker message types
export interface InitSSRMessage {
  type: 'run-ssr';
  replId: string;
}

export interface ExecuteSSRMessage {
  type: 'execute-ssr';
  buildId: number;
  ssrModules: ReplModuleOutput[];
  baseUrl: string;
  manifest: QwikManifest | undefined;
}

export interface SSRResultMessage {
  type: 'ssr-result';
  buildId: number;
  html: string;
  events: ReplEvent[];
}

export interface SSRErrorMessage {
  type: 'ssr-error';
  buildId: number;
  error: string;
  stack?: string;
}

export type OutputPanel =
  | 'app'
  | 'html'
  | 'segments'
  | 'clientBundles'
  | 'serverModules'
  | 'diagnostics';

export type OutputDetail = 'options' | 'console';
