import type { Diagnostic, QwikRollupPluginOptions, QwikManifest } from '@builder.io/qwik/optimizer';
import type { NoSerialize } from '@builder.io/qwik';

export interface ReplInputOptions extends Omit<QwikRollupPluginOptions, 'srcDir' | 'minify'> {
  buildId: string;
  srcInputs: ReplModuleInput[];
  version: string;
  buildMode: 'development' | 'production';
}

export interface ReplStore {
  clientId: string;
  html: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  diagnostics: Diagnostic[];
  monacoDiagnostics: Diagnostic[];
  selectedInputPath: string;
  selectedOutputPanel: OutputPanel;
  selectedOutputDetail: OutputDetail;
  selectedClientModule: string;
  selectedSsrModule: string;
  enableHtmlOutput: boolean;
  enableClientOutput: boolean;
  enableSsrOutput: boolean;
  enableConsole: boolean;
  buildMode: 'development' | 'production';
  ssrBuild: boolean;
  entryStrategy: string;
  debug: boolean;
  serverUrl: string;
  serverWindow: NoSerialize<MessageEventSource> | null;
  version: string | undefined;
  versions: string[];
  events: ReplEvent[];
  build: 0;
}

export interface ReplModuleInput {
  path: string;
  code: string;
  hidden?: boolean;
}

export interface ReplModuleOutput {
  path: string;
  isEntry: boolean;
  code: string;
  size: string;
}

export interface ReplMessageBase {
  type: string;
  clientId: string;
}

export type ReplMessage = ReplUpdateMessage | ReplEventMessage | ReplReadyMessage | ReplResult;

export interface ReplUpdateMessage extends ReplMessageBase {
  type: 'update';
  options: ReplInputOptions;
}

export interface ReplEventMessage extends ReplMessageBase {
  type: 'event';
  event: ReplEvent;
}

export interface ReplReadyMessage extends ReplMessageBase {
  type: 'replready';
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
  message: string;
  element?: Element;
}

export interface ReplResult extends ReplMessageBase {
  type: 'result';
  buildId: string;
  html: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  manifest: QwikManifest | undefined;
  diagnostics: Diagnostic[];
  events: ReplEvent[];
}

export type OutputPanel = 'app' | 'html' | 'clientModules' | 'serverModules' | 'diagnostics';

export type OutputDetail = 'options' | 'console';
