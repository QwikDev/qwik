import type {
  Diagnostic,
  QwikRollupPluginOptions,
  SymbolsEntryMap,
} from '@builder.io/qwik/optimizer';
import type { NoSerialize } from '@builder.io/qwik';

export interface ReplInputOptions extends Omit<QwikRollupPluginOptions, 'srcDir' | 'minify'> {
  srcInputs: ReplModuleInput[];
  version: string;
  buildMode: 'development' | 'production';
}

export interface ReplStore {
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
  outputHtml: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  symbolsEntryMap: SymbolsEntryMap | null;
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

export type OutputDetail = 'options' | 'network' | 'usage';
