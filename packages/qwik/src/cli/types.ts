import type { AppCommand } from './utils/app-command';

export interface CreateAppOptions {
  starterId: string;
  outDir: string;
}

export interface CreateAppResult extends CreateAppOptions {
  docs: string[];
}

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
  pkgJson: IntegrationPackageJson;
  dir: string;
  priority: number;
  docs: string[];
  viteConfig?: ViteConfigUpdates;
}

export type IntegrationType = 'app' | 'feature' | 'adaptor';

export interface Feature {
  id: string;
  description: string;
  add: FeatureCmd;
}

export type FeatureCmd = (app: AppCommand) => Promise<void>;

export interface NextSteps {
  title?: string;
  lines: string[];
}

export interface IntegrationPackageJson {
  name: string;
  description: string;
  version?: string;
  scripts?: { [k: string]: string };
  dependencies?: { [k: string]: string };
  devDependencies?: { [k: string]: string };
  engines?: { node: string };
  private?: boolean;
  files?: string[];
  main?: string;
  exports?: any;
  module?: string;
  qwik?: string;
  types?: string;
  type?: string;
  __qwik__?: {
    displayName?: string;
    nextSteps?: NextSteps;
    docs?: string[];
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
