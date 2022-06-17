export interface GenerateOptions {
  projectName: string;
  appId: string;
  serverId: string;
  featureIds: string[];
  outDir: string;
}

export interface GenerateResult {
  projectName: string;
  appId: string;
  serverId: string;
  outDir: string;
}

export interface Starters {
  apps: StarterData[];
  servers: StarterData[];
  features: StarterData[];
}

export interface StarterData {
  id: string;
  name: string;
  description: string;
  readme: string | null;
  dir: string;
  selectServer: boolean;
  priority: number;
  featureOptions: string[];
}
