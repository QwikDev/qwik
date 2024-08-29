import type { StreamWriter } from '@builder.io/qwik';
import type { RenderOptions } from '@builder.io/qwik/server';
import type { ServerRenderOptions } from '@builder.io/qwik-city/middleware/request-handler';

export interface System {
  createMainProcess: (() => Promise<MainContext>) | null;
  createWorkerProcess: (
    onMessage: (msg: WorkerInputMessage) => Promise<WorkerOutputMessage>
  ) => void;
  createLogger: () => Promise<Logger>;
  getOptions: () => StaticGenerateOptions;
  ensureDir: (filePath: string) => Promise<void>;
  access: (path: string) => Promise<boolean>;
  createWriteStream: (filePath: string) => StaticStreamWriter;
  createTimer: () => () => number;
  getRouteFilePath: (pathname: string, isHtml: boolean) => string;
  getDataFilePath: (pathname: string) => string;
  getEnv: (key: string) => string | undefined;
  platform: { [key: string]: any };
}

export interface StaticStreamWriter extends StreamWriter {
  write: (chunk: string | Buffer) => void;
  end(callback?: () => void): void;
  on(event: 'error', callback: (err: Error) => void): void;
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

/** @public */
export interface StaticGenerateRenderOptions extends RenderOptions {
  /** File system directory where the static files should be written. */
  outDir: string;
  /**
   * The URL `origin`, which is a combination of the scheme (protocol) and hostname (domain). For
   * example, `https://qwik.dev` has the protocol `https://` and domain `qwik.dev`. However, the
   * `origin` does not include a `pathname`.
   *
   * The `origin` is used to provide a full URL during Static Site Generation (SSG), and to simulate
   * a complete URL rather than just the `pathname`. For example, in order to render a correct
   * canonical tag URL or URLs within the `sitemap.xml`, the `origin` must be provided too.
   *
   * If the site also starts with a pathname other than `/`, please use the `basePathname` option in
   * the Qwik City config options.
   */
  origin: string;
  /**
   * Maximum number of workers to use while generating the static pages. Defaults to the number of
   * CPUs available.
   */
  maxWorkers?: number;
  /** Maximum number of tasks to be running at one time per worker. Defaults to `20`. */
  maxTasksPerWorker?: number;
  /**
   * File system path to write the `sitemap.xml` to. Defaults to `sitemap.xml` and written to the
   * root of the `outDir`. Setting to `null` will prevent the sitemap from being created.
   */
  sitemapOutFile?: string | null;
  /** Log level. */
  log?: 'debug';
  /**
   * Set to `false` if the generated static HTML files should not be written to disk. Setting to
   * `false` is useful if the SSG should only write the `q-data.json` files to disk. Defaults to
   * `true`.
   */
  emitHtml?: boolean;
  /**
   * Set to `false` if the generated `q-data.json` data files should not be written to disk.
   * Defaults to `true`.
   */
  emitData?: boolean;
  /**
   * Set to `false` if the static build should not write custom or default `404.html` pages.
   * Defaults to `true`.
   */
  emit404Pages?: boolean;
  /**
   * Defines file system routes relative to the source `routes` directory that should be static
   * generated. Accepts wildcard behavior. This should not include the "base" pathname. If not
   * provided, all routes will be static generated. `exclude` always takes priority over `include`.
   */
  include?: string[];
  /**
   * Defines file system routes relative to the source `routes` directory that should not be static
   * generated. Accepts wildcard behavior. This should not include the "base" pathname. `exclude`
   * always takes priority over `include`.
   */
  exclude?: string[];
}

/** @public */
export interface StaticGenerateOptions extends StaticGenerateRenderOptions {
  /**
   * Path to the SSR module exporting the default render function. In most cases it'll be
   * `./src/entry.ssr.tsx`.
   */
  renderModulePath: string;
  /** Path to the Qwik City Plan module exporting the default `@qwik-city-plan`. */
  qwikCityPlanModulePath: string;
  /** Defaults to `/` */
  basePathname?: string;

  rootDir?: string;
}

export interface StaticGenerateHandlerOptions
  extends StaticGenerateRenderOptions,
    ServerRenderOptions {}

export type WorkerInputMessage = StaticRenderInput | WorkerCloseMessage;

export type WorkerOutputMessage = StaticWorkerRenderResult | WorkerCloseMessage;

export interface StaticRenderInput extends StaticRoute {
  type: 'render';
}

export interface StaticRoute {
  pathname: string;
  params: Record<string, string> | undefined;
}

export interface WorkerCloseMessage {
  type: 'close';
}

export interface StaticWorkerRenderResult {
  type: 'render';
  pathname: string;
  url: string;
  ok: boolean;
  error: { message: string; stack: string | undefined } | null;
  filePath: string | null;
  contentType: string | null;
  resourceType: 'page' | '404' | null;
}

/** @public */
export interface StaticGenerateResult {
  duration: number;
  rendered: number;
  errors: number;
  staticPaths: string[];
}
