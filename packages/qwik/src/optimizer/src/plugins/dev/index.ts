/* eslint-disable no-console */

import type { Connect, HtmlTagDescriptor } from 'vite';
import type { OptimizerSystem, Path } from '../../types';
import { type NormalizedQwikPluginOptions } from '../plugin';
import perfWarningScript from './perf-warning.js?compiled-string';
import clickToComponent from './click-to-component.js?compiled-string';
import errorHost from './error-host.js?compiled-string';
import imageDevToolsStyles from './image-size-runtime.css?inline';
import imageDevTools from './image-size-runtime.js?compiled-string';
import imageDevToolsTemplate from './image-size-warning.html?raw';
import qwikErrorOverlayStyles from './qwik-error-overlay.css?inline';
import inspectorStyles from './qwik-inspector.css?inline';

export async function configurePreviewServer(
  middlewares: Connect.Server,
  ssrOutDir: string,
  sys: OptimizerSystem,
  path: Path
) {
  const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
  const url: typeof import('url') = await sys.dynamicImport('node:url');

  const entryPreviewPaths = ['mjs', 'cjs', 'js'].map((ext) =>
    path.join(ssrOutDir, `entry.preview.${ext}`)
  );

  const entryPreviewModulePath = entryPreviewPaths.find((p) => fs.existsSync(p));
  if (!entryPreviewModulePath) {
    return invalidPreviewMessage(
      middlewares,
      `Unable to find output "${ssrOutDir}/entry.preview" module.\n\nPlease ensure "src/entry.preview.tsx" has been built before the "preview" command.`
    );
  }

  try {
    const entryPreviewImportPath = url.pathToFileURL(entryPreviewModulePath).href;
    const previewModuleImport = await sys.strictDynamicImport(entryPreviewImportPath);

    let previewMiddleware: Connect.HandleFunction | null = null;
    let preview404Middleware: Connect.HandleFunction | null = null;

    if (previewModuleImport.default) {
      if (typeof previewModuleImport.default === 'function') {
        previewMiddleware = previewModuleImport.default;
      } else if (typeof previewModuleImport.default === 'object') {
        previewMiddleware = previewModuleImport.default.router;
        preview404Middleware = previewModuleImport.default.notFound;
      }
    }

    if (typeof previewMiddleware !== 'function') {
      return invalidPreviewMessage(
        middlewares,
        `Entry preview module "${entryPreviewModulePath}" does not export a default middleware function`
      );
    }

    middlewares.use(previewMiddleware);

    if (typeof preview404Middleware === 'function') {
      middlewares.use(preview404Middleware);
    }
  } catch (e) {
    return invalidPreviewMessage(middlewares, String(e));
  }
}

function invalidPreviewMessage(middlewares: Connect.Server, msg: string) {
  console.log(`\n❌ ${msg}\n`);

  middlewares.use((_, res) => {
    res.writeHead(400, {
      'Content-Type': 'text/plain',
    });
    res.end(msg);
  });
}

export const getViteIndexTags = (opts: NormalizedQwikPluginOptions, srcDir: string) => {
  const tags: HtmlTagDescriptor[] = [
    { tag: 'style', children: qwikErrorOverlayStyles, injectTo: 'body' },
    { tag: 'style', children: inspectorStyles, injectTo: 'body' },
    { tag: 'script', attrs: { type: 'module' }, children: errorHost, injectTo: 'body' },
    { tag: 'script', attrs: { type: 'module' }, children: perfWarningScript, injectTo: 'body' },
  ];
  if (opts.devTools?.imageDevTools ?? true) {
    tags.push(
      {
        tag: 'style',
        children: imageDevToolsStyles,
        injectTo: 'body',
      },
      {
        tag: 'script',
        attrs: { type: 'module' },
        children: imageDevTools.replace(
          'globalThis.__TEMPLATE__',
          JSON.stringify(imageDevToolsTemplate)
        ),
        injectTo: 'body',
      }
    );
  }
  if (opts.devTools?.clickToSource ?? true) {
    const hotKeys = opts.devTools.clickToSource ?? [];
    const srcDirUrl = new URL(srcDir + '/', 'http://local.local').href;
    tags.push({
      tag: 'script',
      attrs: { type: 'module' },
      children: clickToComponent
        .replace('globalThis.__HOTKEYS__', JSON.stringify(hotKeys))
        .replace('globalThis.__SRC_DIR__', JSON.stringify(srcDirUrl)),
      injectTo: 'body',
    });
  }
  return tags;
};
