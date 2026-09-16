import { Node, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { findCalls, findNamedImports } from './utils';

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
