import { Node, SyntaxKind, type SourceFile } from 'ts-morph';

/** V1 rendered `htmlFor` as the `for` attribute, v2 renders it as is. */
export const renameHtmlFor = (file: SourceFile) => {
  let changed = false;
  for (const attr of file.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const element = attr.getParentOrThrow().getParentOrThrow();
    if (
      attr.getNameNode().getText() === 'htmlFor' &&
      (Node.isJsxSelfClosingElement(element) || Node.isJsxOpeningElement(element)) &&
      /^[a-z]/.test(element.getTagNameNode().getText())
    ) {
      attr.getNameNode().replaceWithText('for');
      changed = true;
    }
  }
  return changed;
};
