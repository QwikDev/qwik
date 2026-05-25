import { BirpcReturn } from 'birpc';
import { type Dree } from 'dree';
import { VARIABLE_DECLARATION_LIST, EXPRESSION_STATEMENT_LIST } from './constants';

export { Type as RouteType } from 'dree';

export interface ClientFunctions {
  healthCheck(): boolean;
}

export interface DependenciesStatus {
  phase: 'idle' | 'phase1' | 'phase2' | 'done' | 'error';
  loaded: number;
  total: number;
  startedAt: number | null;
  finishedAt: number | null;
  error?: string;
}

export interface PackageInstallResult {
  success: boolean;
  error?: string;
}

export interface BuildAnalysisStatus {
  exists: boolean;
  reportPath: string;
  buildCommand: string | null;
  canTriggerBuild: boolean;
  buildTriggerHint?: string;
}

export interface BuildAnalysisRunResult {
  success: boolean;
  error?: string;
}

export interface ModuleLookupResult {
  pathId: string;
  modules: any;
  error?: string;
}

export type ParsedQwikCodeResult = Omit<ParsedStructure, '__start__'>[];

export interface ServerFunctions {
  healthCheck(): boolean;
  getAssetsFromPublicDir: () => Promise<AssetInfo[]>;
  getComponents: () => Promise<Component[]>;
  getRoutes: () => any;
  getQwikPackages: () => Promise<[string, string][]>;
  getAllDependencies: () => Promise<any[]>;
  getDependenciesStatus: () => Promise<DependenciesStatus>;
  refreshDependencies: () => Promise<void>;
  installPackage: (packageName: string, isDev?: boolean) => Promise<PackageInstallResult>;
  getBuildAnalysisStatus: () => Promise<BuildAnalysisStatus>;
  buildBuildAnalysisReport: () => Promise<BuildAnalysisRunResult>;
  getModulesByPathIds: (pathIds: string | string[]) => Promise<ModuleLookupResult[]>;
  parseQwikCode: (code: string) => Promise<ParsedQwikCodeResult>;
}

export type ServerRpc = BirpcReturn<ClientFunctions, ServerFunctions>;
export type ClientRpc = BirpcReturn<ServerFunctions, ClientFunctions>;

export type AssetType = 'image' | 'font' | 'video' | 'audio' | 'text' | 'json' | 'wasm' | 'other';

export interface AssetInfo {
  path: string;
  type: AssetType;
  publicPath: string;
  relativePath: string;
  filePath: string;
  size: number;
  mtime: number;
}

export interface ImageMeta {
  width: number;
  height: number;
  orientation?: number;
  type?: string;
  mimeType?: string;
}

export type RoutesInfo = Dree;
export type NpmInfo = [string, string][];

export interface Component {
  name: string;
  fileName: string;
  file: string;
}

export type Category = 'variableDeclaration' | 'expressionStatement' | 'listener';
export type HookType =
  | (typeof VARIABLE_DECLARATION_LIST)[number]
  | (typeof EXPRESSION_STATEMENT_LIST)[number]
  | 'customhook';

export interface ParsedStructure {
  variableName: string;
  hookType: HookType;
  category: Category;
  __start__?: number;
  data?: any;
}
