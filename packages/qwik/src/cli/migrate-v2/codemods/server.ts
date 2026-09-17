import { Node, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { appendProperty, ensureNamedImport, findCalls, findNamedImports } from './utils';

const SERVER = '@builder.io/qwik/server';

const renderCalls = (file: SourceFile, names: string[]) =>
  findCalls(
    file,
    names.flatMap((name) => findNamedImports(file, SERVER, name))
  );

const renderOptions = (file: SourceFile, names: string[]) =>
  renderCalls(file, names)
    .map((call) => call.getArguments()[1])
    .filter((arg): arg is ObjectLiteralExpression => Node.isObjectLiteralExpression(arg));

/** The v1 spelling `maximun*` of the in-order streaming options was fixed in v2. */
export const renameMaximunStreamingOptions = (file: SourceFile) => {
  let changed = false;
  for (const options of renderOptions(file, ['renderToStream'])) {
    for (const id of options.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const name = id.getText();
      if (
        (name === 'maximunChunk' || name === 'maximunInitialChunk') &&
        Node.isPropertyAssignment(id.getParent())
      ) {
        id.replaceWithText(name.replace('maximun', 'maximum'));
        changed = true;
      }
    }
  }
  return changed;
};

/**
 * Removes render options that don't exist in v2. `prefetchStrategy: null` disabled the preloader in
 * v1, which is `preloader: false` in v2.
 */
export const removeRemovedRenderOptions = (file: SourceFile) => {
  let changed = false;
  for (const options of renderOptions(file, ['renderToStream', 'renderToString'])) {
    const prefetchStrategy = options.getProperty('prefetchStrategy');
    if (prefetchStrategy) {
      const value = Node.isPropertyAssignment(prefetchStrategy)
        ? prefetchStrategy.getInitializer()
        : undefined;
      if (value?.getKind() === SyntaxKind.NullKeyword && !options.getProperty('preloader')) {
        prefetchStrategy.replaceWithText('preloader: false');
      } else {
        if (value?.getText().includes('symbolsToPrefetch')) {
          warn(
            file.getFilePath(),
            '`prefetchStrategy.symbolsToPrefetch` was removed in v2, preloading is based on the bundle graph.'
          );
        }
        prefetchStrategy.remove();
      }
      changed = true;
    }
    const serviceWorker = options.getProperty('qwikPrefetchServiceWorker');
    if (serviceWorker) {
      serviceWorker.remove();
      changed = true;
    }
    const preloader = options.getProperty('preloader');
    const preloaderOptions = Node.isPropertyAssignment(preloader)
      ? preloader.getInitializer()
      : undefined;
    if (Node.isObjectLiteralExpression(preloaderOptions)) {
      for (const name of ['debug', 'preloadProbability', 'ssrPreloadProbability']) {
        const prop = preloaderOptions.getProperty(name);
        if (prop) {
          prop.remove();
          changed = true;
        }
      }
    }
  }
  return changed;
};

const V1_IN_ORDER = `{ strategy: 'auto', maximumInitialChunk: 50000, maximumChunk: 30000 }`;

/** V2 flushes in smaller chunks by default, keep the v1 chunk sizes. */
export const keepV1StreamingDefaults = (file: SourceFile) => {
  // appending forgets the nodes, so handle one call at a time
  for (const options of renderOptions(file, ['renderToStream']).reverse()) {
    const streaming = options.getProperty('streaming');
    if (!streaming) {
      const spread = options.getProperties().filter(Node.isSpreadAssignment).pop();
      const base = spread ? `...${spread.getExpression().getText()}.streaming, ` : '';
      appendProperty(options, `streaming: { ${base}inOrder: ${V1_IN_ORDER} }`);
      return true;
    }
    const value = Node.isPropertyAssignment(streaming) ? streaming.getInitializer() : undefined;
    if (Node.isObjectLiteralExpression(value) && !value.getProperty('inOrder')) {
      appendProperty(value, `inOrder: ${V1_IN_ORDER}`);
      return true;
    }
  }
  return false;
};

/**
 * Importing `@qwik-client-manifest` is deprecated in v2 and logs an error, the module now exports
 * `getClientManifest()`.
 */
export const replaceClientManifestImport = (file: SourceFile) => {
  const decl = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === '@qwik-client-manifest');
  const named = decl?.getNamedImports() ?? [];
  if (
    !decl ||
    decl.getDefaultImport() ||
    decl.getNamespaceImport() ||
    named.some((n) => n.getName() !== 'manifest')
  ) {
    return false;
  }
  const locals = named.map((n) => (n.getAliasNode() ?? n.getNameNode()).getText());
  decl.remove();
  ensureNamedImport(file, '@builder.io/qwik', 'getClientManifest');
  const imports = file.getImportDeclarations();
  file.insertStatements(
    imports[imports.length - 1].getChildIndex() + 1,
    locals.map((local) => `const ${local} = getClientManifest();`)
  );
  return true;
};
