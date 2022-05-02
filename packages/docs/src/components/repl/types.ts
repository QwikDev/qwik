import type {
  Diagnostic,
  MinifyMode,
  QwikRollupPluginOptions,
  SymbolsEntryMap,
} from '@builder.io/qwik/optimizer';
import type { NoSerialize } from '@builder.io/qwik';

export interface ReplInputOptions extends Omit<QwikRollupPluginOptions, 'srcDir'> {
  srcInputs: ReplModuleInput[];
}

export interface ReplStore {
  inputs: ReplModuleInput[];
  outputHtml: string;
  clientModules: ReplModuleOutput[];
  ssrModules: ReplModuleOutput[];
  diagnostics: Diagnostic[];
  selectedInputPath: string;
  selectedOutputPanel: OutputPanel;
  selectedOutputDetail: OutputDetail;
  selectedClientModule: string;
  selectedSsrModule: string;
  enableHtmlOutput: boolean;
  enableClientOutput: boolean;
  enableSsrOutput: boolean;
  minify: MinifyMode;
  ssrBuild: boolean;
  entryStrategy: string;
  debug: boolean;
  iframeUrl: string;
  iframeWindow: NoSerialize<MessageEventSource> | null;
  version: string;
  load: boolean;
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
  version: string;
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
