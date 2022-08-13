import type { StreamWriter } from '@builder.io/qwik';
import type { QwikCityRequestOptions } from '../../middleware/request-handler/types';

export interface System {
  init: () => Promise<void>;
  close: () => Promise<void>;
  ensureDir: (filePath: string) => Promise<void>;
  createWriteStream: (filePath: string) => StaticStreamWriter;
  getFilePath: (outDir: string, pathname: string) => string;
  createTimer: () => () => number;
  appendResult: (result: StaticWorkerRenderResult) => Promise<void>;
}

export interface StaticStreamWriter extends StreamWriter {
  close(callback: () => void): void;
}

export interface MainContext {
  init: () => Promise<void>;
  close: () => Promise<void>;
  hasAvailableWorker: () => boolean;
  render: (config: StaticWorkerRenderConfig) => Promise<StaticWorkerRenderResult>;
}

export interface Logger {
  info: (...msgs: any[]) => void;
  error: (...msgs: any[]) => void;
  debug: (...msgs: any[]) => void;
}

export interface StaticGeneratorOptions extends QwikCityRequestOptions {
  ourDir: string;
  baseUrl: string;
  urlLoader?: () => Promise<string[]>;
  crawl?: boolean;
  maxWorkers?: number;
  maxTasksPerWorker?: number;
  log?: 'debug';
  sitemapOutFile?: string;
  resultsCsvOutFile?: string;
  errorsOutFile?: string;
}

export type NormalizedStaticGeneratorOptions = Required<StaticGeneratorOptions>;

export interface StaticWorkerRenderConfig {
  pathname: string;
  filePath: string;
}

export interface StaticWorkerRenderResult {
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
