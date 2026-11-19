import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { findNamedImports, findReferences } from './utils';

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

const isJsxChild = (node: Node) => {
  const parent = node.getParent();
  return Node.isJsxElement(parent) || Node.isJsxFragment(parent);
};

/** The text range of `node`, including its line when nothing else is on it. */
const removalRange = (text: string, node: Node): [number, number] => {
  const start = node.getStart();
  const end = node.getEnd();
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const isAloneOnLine =
    lineEnd !== -1 && !text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim();
  return isAloneOnLine ? [lineStart, lineEnd + 1] : [start, end];
};

/** `<PrefetchGraph />` renders nothing in v2, the preloader works without it. */
export const removePrefetchGraph = (file: SourceFile) => {
  for (const local of findNamedImports(file, '@builder.io/qwik', 'PrefetchGraph')) {
    const tags = findReferences(local).map((id) => id.getParentOrThrow());
    if (!tags.every((tag) => Node.isJsxSelfClosingElement(tag) && isJsxChild(tag))) {
      continue;
    }
    const specifier = local.getParentIfKindOrThrow(SyntaxKind.ImportSpecifier);
    const decl = specifier.getImportDeclaration();
    if (decl.getNamedImports().length === 1 && !decl.getDefaultImport()) {
      decl.remove();
    } else {
      specifier.remove();
    }
    // removing JSX nodes one by one can make ts-morph throw when it merges the text around them
    let text = file.getFullText();
    const ranges = tags.map((tag) => removalRange(text, tag)).sort((a, b) => b[0] - a[0]);
    for (const [start, end] of ranges) {
      text = text.slice(0, start) + text.slice(end);
    }
    // this forgets the nodes of the file, so stop at the first import
    file.replaceWithText(text);
    return true;
  }
  return false;
};
