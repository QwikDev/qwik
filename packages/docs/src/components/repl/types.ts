import type { Diagnostic, QwikRollupPluginOptions, QwikManifest } from '@builder.io/qwik/optimizer';
import type { NoSerialize } from '@builder.io/qwik';

export interface ReplInputOptions extends Omit<QwikRollupPluginOptions, 'srcDir' | 'minify'> {
  clientId: string;
  srcInputs: ReplModuleInput[];
  version: string;
  buildMode: 'development' | 'production';
}

export interface ReplStore {
  clientId: string;
  inputs: ReplModuleInput[];
  outputHtml: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  diagnostics: Diagnostic[];
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
  iframeUrl: string;
  iframeWindow: NoSerialize<MessageEventSource> | null;
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

export interface ReplMessageEvent {
  type: 'update';
  options: ReplInputOptions;
}

export interface ReplResult {
  type: 'result';
  clientId: string;
  outputHtml: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  manifest: QwikManifest | undefined;
  diagnostics: Diagnostic[];
  qwikloader: string;
  docElementAttributes: ReplResultAttributes;
  headAttributes: ReplResultAttributes;
  bodyAttributes: ReplResultAttributes;
  bodyInnerHtml: string;
}

export interface ReplResultAttributes {
  [attrName: string]: string;
}

export type OutputPanel = 'app' | 'outputHtml' | 'clientModules' | 'serverModules' | 'diagnostics';

export type OutputDetail = 'options' | 'network';
