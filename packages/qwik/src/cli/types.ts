import type { AppCommand } from './utils/app-command';

export interface CreateAppOptions {
  projectName: string;
  starterId: string;
  outDir: string;
}

export interface CreateAppResult extends CreateAppOptions {}

export interface UpdateAppOptions {
  rootDir: string;
  integration: string;
  installDeps?: boolean;
}

export interface UpdateAppResult {
  rootDir: string;
  integration: IntegrationData;
  updates: FsUpdates;
  commit: (showSpinner?: boolean) => Promise<void>;
}

export interface FsUpdates {
  files: {
    path: string;
    content: string | Buffer;
    type: 'create' | 'overwrite' | 'modify';
  }[];
  installedDeps: { [dep: string]: string };
}

export interface IntegrationData {
  id: string;
  type: IntegrationType;
  name: string;
  description: string;
  pkgJson: IntegrationPackageJson;
  dir: string;
  priority: number;
  viteConfig?: ViteConfigUpdates;
}

export type IntegrationType = 'app' | 'feature' | 'server' | 'static-generator';

export interface Feature {
  id: string;
  description: string;
  type: 'server' | 'static';
  add: FeatureCmd;
}

export type FeatureCmd = (app: AppCommand) => Promise<void>;

export interface IntegrationPackageJson {
  name: string;
  description: string;
  version?: string;
  scripts?: { [k: string]: string };
  dependencies?: { [k: string]: string };
  devDependencies?: { [k: string]: string };
  private?: boolean;
  __qwik__?: {
    priority: number;
    viteConfig?: ViteConfigUpdates;
  };
}

export interface EnsureImport {
  defaultImport?: string;
  namedImports?: string[];
  importPath: string;
}

export interface ViteConfigUpdates {
  imports?: EnsureImport[];
  viteConfig?: { [key: string]: string };
  vitePlugins?: string[];
  qwikViteConfig?: { [key: string]: string };
}
