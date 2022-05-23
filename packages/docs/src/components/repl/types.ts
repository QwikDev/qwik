import type { Diagnostic, QwikRollupPluginOptions, QwikManifest } from '@builder.io/qwik/optimizer';
import type { NoSerialize } from '@builder.io/qwik';

export interface ReplInputOptions extends Omit<QwikRollupPluginOptions, 'srcDir' | 'minify'> {
  clientId: string;
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
  lastOutputPanel: OutputPanel | null;
  selectedOutputDetail: OutputDetail;
  selectedClientModule: string;
  selectedSsrModule: string;
  enableHtmlOutput: boolean;
  enableClientOutput: boolean;
  enableSsrOutput: boolean;
  buildMode: 'development' | 'production';
  ssrBuild: boolean;
  entryStrategy: string;
  debug: boolean;
  serverUrl: string;
  serverWindow: NoSerialize<MessageEventSource> | null;
  version: string | undefined;
  versions: string[];
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

export interface ReplUpdateMessage {
  type: 'update';
  options: ReplInputOptions;
}

export interface ReplResult {
  type: 'result';
  clientId: string;
  buildId: string;
  html: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  manifest: QwikManifest | undefined;
  diagnostics: Diagnostic[];
}

export type OutputPanel = 'app' | 'html' | 'clientModules' | 'serverModules' | 'diagnostics';

export type OutputDetail = 'options' | 'network';
