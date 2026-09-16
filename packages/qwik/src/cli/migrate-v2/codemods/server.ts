import { Node, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';
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
