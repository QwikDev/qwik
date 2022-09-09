import type { PackageJSON } from '../../../../scripts/util';
import type { AppCommand } from './app-command';

export interface CreateAppOptions {
  projectName: string;
  starterId: string;
  outDir: string;
}

export interface CreateAppResult extends CreateAppOptions {}

export interface UpdateAppOptions {
  rootDir: string;
  addIntegration?: string;
}

export interface UpdateAppResults extends UpdateAppOptions {}

export interface StarterData {
  id: string;
  name: string;
  description: string;
  pkgJson: PackageJSON;
  dir: string;
  priority: number;
  featureOptions: string[];
  featureEnabled: string[];
}

export type StarterType = 'apps' | 'features' | 'servers' | 'static-generators';

export interface Feature {
  id: string;
  description: string;
  type: 'server' | 'static';
  add: FeatureCmd;
}

export type FeatureCmd = (app: AppCommand) => Promise<void>;
