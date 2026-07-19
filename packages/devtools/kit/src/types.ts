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

export type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies';

export type InstallDependencyType = 'dependencies' | 'devDependencies';

export type DependencyVersionStatus = 'latest' | 'outdated' | 'unknown' | 'error';

export interface DependencyAuthor {
  name?: string;
  email?: string;
  url?: string;
}

export interface DependencyInfo {
  name: string;
  requestedVersion: string;
  currentVersion: string;
  latestVersion?: string;
  type: DependencyType;
  status: DependencyVersionStatus;
  description: string;
  author?: string | DependencyAuthor;
  homepage?: string;
  repository?: string;
  npmUrl: string;
  iconUrl?: string | null;
}

export interface PackageSearchResult {
  name: string;
  latestVersion: string;
  description: string;
  author?: string | DependencyAuthor;
  npmUrl: string;
  isInstalled: boolean;
  installedVersion?: string;
}

export interface PackageSearchResponse {
  results: PackageSearchResult[];
  error?: string;
}

export interface DependencyOperationResult {
  success: boolean;
  action: 'install' | 'update';
  packageName: string;
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
  getAllDependencies: () => Promise<DependencyInfo[]>;
  getDependenciesStatus: () => Promise<DependenciesStatus>;
  refreshDependencies: () => Promise<DependencyInfo[]>;
  searchPackages: (query: string) => Promise<PackageSearchResponse>;
  installPackage: (
    packageName: string,
    dependencyType: InstallDependencyType
  ) => Promise<DependencyOperationResult>;
  updatePackage: (packageName: string) => Promise<DependencyOperationResult>;
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
