import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { findNamedImports } from './utils';

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

/** V1 ignored the children of `<Slot>`, v2 renders them as fallback content. */
export const removeSlotChildren = (file: SourceFile) => {
  const slots = findNamedImports(file, '@builder.io/qwik', 'Slot').map((id) => id.getText());
  let changed = false;
  for (const element of file.getDescendantsOfKind(SyntaxKind.JsxElement).reverse()) {
    const opening = element.getOpeningElement();
    if (!slots.includes(opening.getTagNameNode().getText())) {
      continue;
    }
    const attributes = opening.getAttributes().map((a) => a.getText());
    element.replaceWithText(
      `<${opening.getTagNameNode().getText()}${attributes.map((a) => ` ${a}`).join('')} />`
    );
    changed = true;
  }
  return changed;
};
