import type { StreamWriter } from '@builder.io/qwik';
import type { QwikCityRequestOptions } from '../../middleware/request-handler/types';

export interface System {
  createMainProcess: () => Promise<MainContext>;
  createWorkerProcess: (
    onRender: (config: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>
  ) => void;
  createLogger: () => Promise<Logger>;
  getOptions: () => StaticGeneratorOptions;
  isMainThread: () => boolean;
  ensureDir: (filePath: string) => Promise<void>;
  createWriteStream: (filePath: string) => StaticStreamWriter;
  createTimer: () => () => number;
  getIndexFilePath: (pathname: string) => string;
}

export interface StaticStreamWriter extends StreamWriter {
  close(callback: () => void): void;
}

export interface MainContext {
  hasAvailableWorker: () => boolean;
  render: (config: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>;
  close: () => Promise<void>;
}

export interface Logger {
  info: (...msgs: any[]) => void;
  error: (...msgs: any[]) => void;
  debug: (...msgs: any[]) => void;
}

export interface StaticGeneratorOptions extends QwikCityRequestOptions {
  outDir: string;
  baseUrl: string;
  urlLoader?: () => Promise<string[]>;
  crawl?: boolean;
  maxWorkers?: number;
  maxTasksPerWorker?: number;
  log?: 'debug';
  sitemapOutFile?: string;
}

export interface StaticWorkerRenderConfig {
  pathname: string;
}

export interface StaticWorkerRenderResult {
  pathname: string;
  url: string;
  links: string[];
  duration: number;
  status: number;
  ok: boolean;
  error: string | null;
}

export interface StaticGeneratorResults {
  duration: number;
  rendered: number;
  errors: number;
  urls: number;
}
