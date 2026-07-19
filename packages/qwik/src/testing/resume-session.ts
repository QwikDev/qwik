import type { RenderRoot } from '@qwik.dev/core';
import {
  QContainerSelector,
  Scheduler,
  createContainerContext,
  getPlatform,
  setPlatform,
} from '@qwik.dev/core/internal';
import {
  _renderToStringCompiled as renderToString,
  type _SsrRenderRoot as SsrRenderRoot,
} from '@qwik.dev/core/server';
import type { RenderOptions, RenderResult } from '../core/test-utils';
import { bootQwikLoader, type QwikLoaderTestDriver } from '../core/qwikloader-test-driver';
import { getSymbolHash, SYNC_QRL } from '../core/shared/qrl/qrl-utils';
import { QRL_RUNTIME_CHUNK } from '../core/shared/serdes/qrl-to-string';
import { createDocument } from './document';
import { getTestPlatform } from './platform';

/** Compiler target selected by qwikVite for tests. @public */
export type QwikTestTarget = 'csr' | 'resume' | 'ssr';

interface TestResumeSegment {
  name: string;
  ctxKind: 'eventHandler' | 'function';
}

interface TestResumeTransformModule {
  path: string;
  code: string;
  segment: TestResumeSegment | null;
}

/** @internal */
export interface TestResumeTransformMetadata {
  server: readonly TestResumeTransformModule[];
  client: readonly TestResumeTransformModule[];
}

type ModuleImport = (id: string) => Promise<Record<string, unknown>>;

export const TEST_RESUME_REGISTRY = Symbol.for('@qwik.dev/core/testing/resume');
export const TEST_RESUME_IMPORTER = Symbol.for('@qwik.dev/core/testing/importer');
export const TEST_TARGET = Symbol.for('@qwik.dev/core/testing/target');
export const TEST_COMPILED = Symbol.for('@qwik.dev/core/testing/compiled');

/** @internal */
export function getTestTarget(): QwikTestTarget {
  const definedTarget = (globalThis as typeof globalThis & { qwikTestTarget?: unknown })
    .qwikTestTarget;
  const registeredTarget = (globalThis as typeof globalThis & Record<symbol, unknown>)[TEST_TARGET];
  const target = definedTarget ?? registeredTarget;
  return target === 'csr' || target === 'resume' || target === 'ssr' ? target : 'ssr';
}

/** @internal */
export function hasCompiledTestTarget(): boolean {
  return (globalThis as typeof globalThis & Record<symbol, unknown>)[TEST_COMPILED] === true;
}

/** @internal */
export function getResumeRegistry(): Map<string, TestResumeTransformMetadata> {
  const registry = (globalThis as typeof globalThis & Record<symbol, unknown>)[
    TEST_RESUME_REGISTRY
  ];
  return registry instanceof Map ? registry : new Map();
}

/** @internal */
export function getTestModuleImporter(): ModuleImport | undefined {
  const moduleImport = (globalThis as typeof globalThis & Record<symbol, unknown>)[
    TEST_RESUME_IMPORTER
  ] as ModuleImport | undefined;
  if (moduleImport === undefined) {
    return;
  }
  return createResumeModuleImporter(Array.from(getResumeRegistry().values()), moduleImport);
}

/** @internal */
export function createResumeSymbolMapper(metadata: readonly TestResumeTransformMetadata[]) {
  const symbols = new Map<string, string>();
  for (const transform of metadata) {
    for (const module of transform.client) {
      if (module.segment !== null) {
        symbols.set(module.segment.name, module.path);
      }
    }
  }

  return (symbol: string): [string, string] | undefined => {
    if (symbol === SYNC_QRL) {
      return [symbol, ''];
    }
    const moduleId = symbols.get(symbol);
    if (moduleId !== undefined) {
      return [symbol, moduleId];
    }
    return symbol.startsWith('_') && symbol.length < 6 ? [symbol, QRL_RUNTIME_CHUNK] : undefined;
  };
}

/** @internal */
export function createResumeModuleImporter(
  metadata: readonly TestResumeTransformMetadata[],
  moduleImport: ModuleImport
): ModuleImport {
  const allowedIds = new Set(
    metadata.flatMap((transform) => transform.client.map((mod) => mod.path))
  );

  return async (href) => {
    const id =
      href === QRL_RUNTIME_CHUNK || href.endsWith(`/${QRL_RUNTIME_CHUNK}`)
        ? '@qwik.dev/core'
        : resolveRegisteredModuleId(href, allowedIds);
    try {
      return await moduleImport(id);
    } catch (error) {
      throw new Error(`Unable to import registered test module "${href}".`, { cause: error });
    }
  };
}

/** @internal */
export async function renderSsrToDom<Props>(
  root: RenderRoot<Props>,
  options: RenderOptions<Props> | undefined,
  shouldResume: boolean
): Promise<RenderResult> {
  const previousPlatform = getPlatform();
  const metadata = Array.from(getResumeRegistry().values());
  const runnerImport = (globalThis as typeof globalThis & Record<symbol, unknown>)[
    TEST_RESUME_IMPORTER
  ] as ModuleImport | undefined;
  if (shouldResume && (metadata.length === 0 || runnerImport === undefined)) {
    throw new Error("Resume rendering requires qwikVite({ testTarget: 'resume' }).");
  }

  const scheduler = options?.scheduler ?? new Scheduler(() => {});
  const symbolMapper = shouldResume ? createResumeSymbolMapper(metadata) : undefined;
  let qwikLoader: QwikLoaderTestDriver | undefined;
  let container: HTMLElement | undefined;

  try {
    const rendered = await renderToString(root as SsrRenderRoot<Props>, {
      base: options?.base,
      locale: options?.locale,
      props: options?.props,
      qwikLoader: options?.qwikLoader,
      serverData: options?.serverData,
      symbolMapper,
    });
    const document = createDocument({ html: rendered.html });
    const qwikContainer = document.querySelector(QContainerSelector) as HTMLElement | null;
    if (qwikContainer === null) {
      throw new Error('Missing Qwik container.');
    }
    container =
      qwikContainer === document.documentElement && document.body !== null
        ? document.body
        : qwikContainer;
    installSyncQrls(document, qwikContainer, rendered.snapshotResult?.funcs);
    createContainerContext(qwikContainer, scheduler);

    const importModule = shouldResume
      ? createResumeModuleImporter(metadata, runnerImport!)
      : undefined;
    setPlatform(
      shouldResume && importModule !== undefined
        ? createResumePlatform(document, importModule)
        : getTestPlatform()
    );
    if (shouldResume && importModule !== undefined && hasQwikLoader(qwikContainer)) {
      qwikLoader = withSchedulerFlush(await bootQwikLoader(document, importModule), scheduler);
    }

    const nodes = Array.from(container.childNodes);
    const cleanup = createCleanup(container, () => {
      qwikLoader?.cleanup();
      setPlatform(previousPlatform);
    });
    const result: RenderResult = {
      document,
      container,
      html: container.innerHTML,
      nodes,
      scheduler,
      qwikLoader,
      flush: () => settleScheduler(scheduler),
      cleanup,
    };
    await scheduler.flushInteraction();
    printResumeDebug(metadata, container, options?.debug === true);
    return result;
  } catch (error) {
    qwikLoader?.cleanup();
    if (container !== undefined) {
      while (container.firstChild !== null) {
        container.removeChild(container.firstChild);
      }
    }
    setPlatform(previousPlatform);
    throw error;
  }
}

function resolveRegisteredModuleId(href: string, allowedIds: ReadonlySet<string>): string {
  if (allowedIds.has(href)) {
    return href;
  }
  const directId = stripQuery(href);
  if (allowedIds.has(directId)) {
    return directId;
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(href)) {
    const url = new URL(href);
    if (url.protocol !== 'file:' && url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported test module protocol "${url.protocol}".`);
    }
    const path = decodeURIComponent(url.pathname);
    if (allowedIds.has(path)) {
      return path;
    }
    const windowsPath = /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
    if (allowedIds.has(windowsPath)) {
      return windowsPath;
    }
  }
  throw new Error(`Test module "${href}" is not registered by qwikVite.`);
}

function stripQuery(id: string): string {
  const index = id.search(/[?#]/);
  return index === -1 ? id : id.slice(0, index);
}

function createResumePlatform(document: Document, moduleImport: ModuleImport) {
  return {
    ...getTestPlatform(),
    importSymbol(
      container: Element | undefined,
      url: string | URL | null | undefined,
      symbol: string
    ) {
      const registered = (globalThis as any).__qwik_reg_symbols?.get(getSymbolHash(symbol));
      if (registered !== undefined) {
        return registered;
      }
      if (container === undefined || url == null) {
        throw new Error(`Unable to import symbol "${symbol}" without a container and URL.`);
      }
      const base = new URL(container.getAttribute('q:base') ?? document.baseURI, document.baseURI);
      return moduleImport(new URL(url, base).href).then((module) => module[symbol]);
    },
  };
}

function installSyncQrls(
  document: Document,
  container: Element,
  sources?: readonly string[]
): void {
  const instance = container.getAttribute('q:instance');
  if (instance === null || sources === undefined || sources.length === 0) {
    return;
  }
  const win = document.defaultView as Window;
  const functions = sources.map((source) => {
    // eslint-disable-next-line no-new-func
    return new Function('window', 'document', 'history', 'location', `return (${source})`)(
      win,
      document,
      win.history,
      win.location
    );
  });
  (document as Document & Record<string, unknown>)[`qFuncs_${instance}`] = functions;
}

function hasQwikLoader(container: Element): boolean {
  const loader = container.ownerDocument.getElementById('qwikloader');
  return loader !== null && container.contains(loader);
}

function withSchedulerFlush(
  qwikLoader: QwikLoaderTestDriver,
  scheduler: Scheduler
): QwikLoaderTestDriver {
  return {
    async dispatch(target, type, payload) {
      const event = await qwikLoader.dispatch(target, type, payload);
      await settleScheduler(scheduler);
      return event;
    },
    cleanup: () => qwikLoader.cleanup(),
  };
}

async function settleScheduler(scheduler: Scheduler): Promise<void> {
  // ponytail: test-only drain until Scheduler exposes an idle promise.
  for (let i = 0; i < 50; i++) {
    await scheduler.flushInteraction();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createCleanup(container: HTMLElement, dispose: () => void): () => void {
  let isCleaned = false;
  return () => {
    if (isCleaned) {
      return;
    }
    isCleaned = true;
    dispose();
    while (container.firstChild !== null) {
      container.removeChild(container.firstChild);
    }
  };
}

function printResumeDebug(
  metadata: readonly TestResumeTransformMetadata[],
  container: Element,
  isEnabled: boolean
): void {
  if (!isEnabled) {
    return;
  }
  const section = (label: string, contents: string) =>
    `\n-------------------- ${label} --------------------\n${contents}`;
  const server = metadata.flatMap((entry) => entry.server);
  const client = metadata
    .flatMap((entry) => entry.client)
    .filter((module) => module.segment?.ctxKind === 'eventHandler');
  const state = Array.from(container.querySelectorAll('script[type="qwik/state"]'), (script) =>
    (script.textContent ?? '').trim()
  ).join('\n');
  const modules = (entries: readonly TestResumeTransformModule[]) =>
    entries.map((module) => `// ${module.path}\n${module.code}`).join('\n\n');
  // eslint-disable-next-line no-console
  console.log(
    [
      section('SSR TRANSFORM', modules(server)),
      section('CLIENT SEGMENTS', modules(client)),
      section('HTML', container.innerHTML),
      section('SERIALIZED STATE', state),
    ].join('\n')
  );
}
