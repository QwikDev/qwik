import type { NoSerialize, Signal } from '@builder.io/qwik';
import type {
  Diagnostic,
  QwikManifest,
  QwikRollupPluginOptions,
  TransformModule,
} from '@builder.io/qwik/optimizer';
import type { ReplInstance } from './ui/repl-instance';

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

export type OutputPanel =
  | 'app'
  | 'html'
  | 'symbols'
  | 'clientBundles'
  | 'serverModules'
  | 'diagnostics';

export type OutputDetail = 'options' | 'console';
