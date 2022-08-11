export interface System {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, data: any) => Promise<void>;
  getFilePath: (outDir: string, pathname: string) => string;
}

export interface MainContext {
  init: () => Promise<void>;
  hasAvailableWorker: () => boolean;
  render: (config: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>;
  dispose: () => Promise<void>;
}

export interface Logger {
  info: (...msgs: any[]) => void;
  error: (...msgs: any[]) => void;
  debug: (...msgs: any[]) => void;
}

export interface StaticGeneratorOptions {
  ourDir: string;
  baseUrl: string;
  urls?: string[];
  crawl?: boolean;
  maxWorkers?: number;
  maxTasksPerWorker?: number;
  log?: 'debug';
}

export type NormalizedStaticGeneratorOptions = Required<StaticGeneratorOptions>;

export interface StaticWorkerRenderConfig {
  pathname: string;
  filePath: string;
}

export interface StaticWorkerRenderResult {
  anchorPathnames: string[];
}
