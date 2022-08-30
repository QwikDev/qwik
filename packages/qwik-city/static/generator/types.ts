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
  /**
   * File system directory where the static files should be written.
   */
  outDir: string;
  /**
   * The URL `origin`, which is a combination of the scheme (protocol) and hostname (domain).
   * For example, `https://qwik.builder.io` has the protocol `https://` and domain `qwik.builder.io`.
   * However, the `origin` does not include a `pathname`.
   *
   * The `origin` is used to provide a full URL during Static Site Generation (SSG), and to
   * simulate a complete URL rather than just the `pathname`. For example, in order to
   * render a correct canonical tag URL or URLs within the `sitemap.xml`, the `origin` must
   * be provided too.
   *
   * If the site also starts with a pathname other than `/`, please use the `basePathname`
   * option in the Qwik City config options.
   */
  origin: string;
  /**
   * Maximum number of workers to use while generating the static pages.
   * Defaults to the number of CPUs available.
   */
  maxWorkers?: number;
  /**
   * Maximum number of tasks to be running at one time per worker.
   * Defaults to `20`.
   */
  maxTasksPerWorker?: number;
  /**
   * File system path to write the `sitemap.xml` to. Defaults to `sitemap.xml`
   * and written to the root of the `outDir`. Setting to `null` will prevent
   * the sitemap from being created.
   */
  sitemapOutFile?: string;
  /**
   * Log level.
   */
  log?: 'debug';
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
