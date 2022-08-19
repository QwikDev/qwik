import type { StreamWriter } from '@builder.io/qwik';
import type { RouteParams } from '../../runtime/src';
import type { QwikCityRequestOptions } from '../../middleware/request-handler/types';

export interface System {
  createMainProcess: () => Promise<MainContext>;
  createWorkerProcess: (
    onMessage: (msg: WorkerInputMessage) => Promise<WorkerOutputMessage>
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
  render: (staticRoute: StaticRenderInput) => Promise<StaticWorkerRenderResult>;
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

export type WorkerInputMessage = StaticRenderInput | WorkerCloseMessage;

export type WorkerOutputMessage = StaticWorkerRenderResult | WorkerCloseMessage;

export interface StaticRenderInput extends StaticRoute {
  type: 'render';
}

export interface StaticRoute {
  pathname: string;
  params: RouteParams | undefined;
}

export interface WorkerCloseMessage {
  type: 'close';
}

export interface StaticWorkerRenderResult {
  type: 'render';
  pathname: string;
  url: string;
  ok: boolean;
  error: string | null;
}

export interface StaticGeneratorResults {
  duration: number;
  rendered: number;
  errors: number;
}
