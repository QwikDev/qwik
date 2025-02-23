import type { AppCommand } from './utils/app-command';

export interface CreateAppOptions {
  starterId: string;
  outDir: string;
}

export interface CreateAppResult extends CreateAppOptions {
  docs: string[];
  pkgManager: string;
}

export interface UpdateAppOptions {
  rootDir: string;
  integration: string;
  installDeps?: boolean;
  projectDir?: string;
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
  installedScripts: string[];
}

export interface IntegrationData {
  id: string;
  type: IntegrationType;
  name: string;
  pkgJson: IntegrationPackageJson;
  dir: string;
  target?: string;
  priority: number;
  docs: string[];
  viteConfig?: ViteConfigUpdates;
  // Files and folders that should be copied to root ignoring `projectDir`
  alwaysInRoot?: string[];
}

export type IntegrationType = 'app' | 'feature' | 'adapter';

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
  peerDependencies?: { [k: string]: string };
  optionalDependencies?: { [k: string]: string };
  engines?: { node: string };
  private?: boolean;
  files?: string[];
  main?: string;
  exports?: any;
  module?: string;
  qwik?: string;
  qwikTemplates?: string[];
  types?: string;
  type?: string;
  __qwik__?: QwikIntegrationConfig;
}

export interface QwikIntegrationConfig {
  displayName?: string;
  nextSteps?: NextSteps;
  docs?: string[];
  priority: number;
  postInstall?: string;
  viteConfig?: ViteConfigUpdates;
  alwaysInRoot?: string[];
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
  vitePluginsPrepend?: string[];
  qwikViteConfig?: { [key: string]: string };
}

export interface Template {
  absolute: string;
  relative: string;
}

export interface TemplateSet {
  id: string;
  component: Template[];
  route: Template[];
  markdown: Template[];
  mdx: Template[];
}
