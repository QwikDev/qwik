import { existsSync, renameSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { Node, SyntaxKind, type Project, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { visitNotIgnoredFiles } from '../tools/visit-not-ignored-files';

const ROUTE_FILE = /\.(tsx|ts|jsx|js|mdx|md)$/;

/**
 * `error.tsx` (and `error!`, `error@name`) are error boundaries in v2, v1 ignored those files. They
 * are renamed so they keep being plain modules. Numeric files like `500.tsx` were routes in v1.
 */
export const renameV2ErrorBoundaryFiles = (project: Project) => {
  visitNotIgnoredFiles('.', (path) => {
    if (!/(^|\/)routes\//.test(path) || !ROUTE_FILE.test(path)) {
      return;
    }
    const name = basename(path).replace(ROUTE_FILE, '');
    if (/^error(|!|@.+)$/.test(name)) {
      const newPath = join(dirname(path), `_${basename(path)}`);
      if (existsSync(newPath)) {
        warn(path, `this file is an error boundary in v2, rename it (${newPath} already exists).`);
        return;
      }
      const sourceFile = project.getSourceFile(path);
      if (sourceFile) {
        // updates the imports of the file
        sourceFile.move(resolve(newPath));
      } else {
        renameSync(path, newPath);
      }
      warn(path, `renamed to ${newPath}, v2 would render it as the error page.`);
    } else if (parseInt(name, 10) >= 400 && parseInt(name, 10) <= 599) {
      warn(path, 'v1 served this file as a route, v2 ignores it (only `404` is a special name).');
    }
  });
};

const HANDLER = /^on(Request|Get|Post|Put|Patch|Delete|Head|Options)$/;
const PROBE = 'export const useV1NavigationProbe = routeLoader$(() => null);';

const exportsHandlers = (file: SourceFile) =>
  [...file.getExportedDeclarations().keys()].some((name) => HANDLER.test(name));

const exportsLoader = (file: SourceFile) =>
  file
    .getVariableDeclarations()
    .some(
      (d) =>
        d.isExported() &&
        Node.isCallExpression(d.getInitializer()) &&
        /^routeLoader(\$|Qrl)$/.test((d.getInitializer() as any).getExpression().getText())
    );

const addProbe = (file: SourceFile) => {
  file.addStatements(PROBE);
  const decl = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === '@builder.io/qwik-city' && !d.isTypeOnly());
  if (!decl) {
    file.insertImportDeclaration(0, {
      moduleSpecifier: '@builder.io/qwik-city',
      namedImports: ['routeLoader$'],
    });
  } else if (!decl.getNamedImports().some((n) => n.getName() === 'routeLoader$')) {
    decl.addNamedImport('routeLoader$');
  }
};

/**
 * V1 requested the route data on every SPA navigation, which ran the server middleware
 * (`onRequest`, `onGet`, ... in plugins, layouts and pages). v2 only requests route loaders, so a
 * route loader is added where middleware exists.
 */
export const addNavigationProbeLoaders = (project: Project) => {
  const routeFiles = project
    .getSourceFiles()
    .filter(
      (f) => /\/routes\//.test(f.getFilePath()) && /\.(tsx|ts|jsx|js)$/.test(f.getFilePath())
    );
  const hasMiddleware = routeFiles.some(
    (f) => /^plugin(@.+)?\.[jt]sx?$/.test(f.getBaseName()) || exportsHandlers(f)
  );
  if (!hasMiddleware) {
    return;
  }
  const routesDir = routeFiles[0].getFilePath().replace(/(\/routes)\/.*$/, '$1');
  const rootLayout = routeFiles.find((f) =>
    /^layout!?\.[jt]sx?$/.test(f.getFilePath().slice(routesDir.length + 1))
  );
  if (!rootLayout) {
    addProbe(project.createSourceFile(`${routesDir}/layout.ts`, ''));
  } else if (!exportsLoader(rootLayout)) {
    addProbe(rootLayout);
  }
  for (const page of routeFiles) {
    if (
      /^index(|!|@.+)\.[jt]sx?$/.test(page.getBaseName()) &&
      page.getDefaultExportSymbol() &&
      exportsHandlers(page) &&
      !exportsLoader(page)
    ) {
      addProbe(page);
    }
  }
  warn(
    routesDir,
    'v2 only requests route loaders on SPA navigation, `useV1NavigationProbe` loaders were added so the middleware still runs. Middleware redirects now happen after the new page is shown.'
  );
};

const V1_ERRORS_PLUGIN = `import type { RequestHandler } from '@builder.io/qwik-city';
import { getErrorHtml, ServerError } from '@builder.io/qwik-city/middleware/request-handler';

/**
 * Added by \`qwik migrate-v2\`. v1 answered errors thrown with \`throw ev.error(status, data)\` with a
 * minimal error page, v2 renders the error page of the app instead. Remove this plugin to use the v2
 * behavior.
 */
export const onRequest: RequestHandler = async (ev) => {
  try {
    await ev.next();
  } catch (e) {
    const accept = ev.request.headers.get('Accept');
    if (
      e instanceof ServerError &&
      !ev.headersSent &&
      !ev.internalRequest &&
      (!accept || accept.includes('text/html'))
    ) {
      ev.html(e.status as Parameters<typeof ev.html>[0], getErrorHtml(e.status, e.data));
      return;
    }
    throw e;
  }
};
`;

/** Keeps the v1 responses for server errors by adding a plugin that runs before the others. */
export const addV1ErrorResponsePlugin = (project: Project) => {
  const routeFile = project.getSourceFiles().find((f) => /\/routes\//.test(f.getFilePath()));
  if (!routeFile) {
    return;
  }
  const routesDir = routeFile.getFilePath().replace(/(\/routes)\/.*$/, '$1');
  const name = 'plugin@000-v1-errors.ts';
  if (
    project.getSourceFile(`${routesDir}/plugin.ts`) ||
    project.getSourceFile(`${routesDir}/plugin.js`)
  ) {
    warn(
      `${routesDir}/${name}`,
      'errors thrown in `plugin.ts` are rendered by the v2 error page, move its code to a `plugin@name.ts` file to keep the v1 error responses.'
    );
  }
  project.createSourceFile(`${routesDir}/${name}`, V1_ERRORS_PLUGIN, { overwrite: true });
};

/** In v2 `resolveValue(action)` returns `undefined` inside route loaders. */
export const warnLoadersReadingActions = (project: Project) => {
  const calls = project
    .getSourceFiles()
    .flatMap((f) => f.getDescendantsOfKind(SyntaxKind.CallExpression));
  const actions = new Set(
    calls
      .filter((c) => /^(routeAction|globalAction)(\$|Qrl)$/.test(c.getExpression().getText()))
      .map((c) => c.getParentIfKind(SyntaxKind.VariableDeclaration)?.getName())
      .filter(Boolean)
  );
  for (const loader of calls) {
    if (!/^routeLoader(\$|Qrl)$/.test(loader.getExpression().getText())) {
      continue;
    }
    const readsAction = loader
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some(
        (c) =>
          /(^|\.)resolveValue$/.test(c.getExpression().getText()) &&
          actions.has(c.getArguments()[0]?.getText())
      );
    if (readsAction) {
      warn(
        loader.getSourceFile().getFilePath(),
        'route loaders can no longer read action results with `resolveValue(action)` in v2, it returns `undefined`.'
      );
    }
  }
};
