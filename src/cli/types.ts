export interface GenerateOptions {
  projectName: string;
  appId: string;
  serverId?: string;
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
}

export interface StarterData {
  id: string;
  name: string;
  description: string;
  dir: string;
  priority: number;
}
