import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { findCalls, findNamedImports } from './utils';

const toKebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const toCamel = (s: string) => s.replace(/-./g, (m) => m[1].toUpperCase());

/**
 * The DOM event a v1 listener attribute `on:<attr>` listened to. v1 listened to the camel case name
 * and only called the handler when its kebab case matched the attribute, otherwise it never ran.
 */
const v1Event = (attr: string) => {
  const event = toCamel(attr);
  return toKebab(event) === attr ? event : undefined;
};

/** The DOM event of a JSX `on<name>$` prop in v1 */
export const v1JsxEvent = (name: string) =>
  v1Event(name.startsWith('-') ? toKebab(name.slice(1)) : name.toLowerCase());

/** The DOM event of a JSX `on<name>$` prop in v2 */
export const v2JsxEvent = (name: string) =>
  name === 'DOMContentLoaded' ? name : name.startsWith('-') ? name.slice(1) : name.toLowerCase();

const JSX_EVENT = /^((?:window:|document:)?on)(.+)\$$/;

/**
 * V1 treated a `-` in event names as "uppercase the next letter", v2 keeps `-` and uses a leading
 * `-` to keep the case. Rewrites the names so the same DOM events are listened to.
 */
export const keepV1EventNames = (file: SourceFile) => {
  let changed = false;
  for (const attr of file.getDescendantsOfKind(SyntaxKind.JsxAttribute).reverse()) {
    const nameNode = attr.getNameNode();
    const match = JSX_EVENT.exec(nameNode.getText());
    if (!match) {
      continue;
    }
    const [, prefix, name] = match;
    const event = v1JsxEvent(name);
    if (event === v2JsxEvent(name)) {
      continue;
    }
    const element = attr.getParentOrThrow().getParentOrThrow();
    const tag =
      Node.isJsxSelfClosingElement(element) || Node.isJsxOpeningElement(element)
        ? element.getTagNameNode().getText()
        : '';
    if (!event) {
      warn(
        file.getFilePath(),
        `\`${nameNode.getText()}\` never ran in v1 (invalid event name) but may run in v2.`
      );
    } else if (!/^[a-z]/.test(tag)) {
      warn(
        file.getFilePath(),
        `\`<${tag} ${nameNode.getText()}>\` listens to "${v2JsxEvent(name)}" in v2 instead of "${event}".`
      );
    } else {
      nameNode.replaceWithText(`${prefix}-${event}$`);
      changed = true;
    }
  }

  const hooks = ['useOn', 'useOnDocument', 'useOnWindow'].flatMap((name) =>
    findNamedImports(file, '@builder.io/qwik', name)
  );
  for (const call of findCalls(file, hooks)) {
    const arg = call.getArguments()[0];
    const literals = Node.isArrayLiteralExpression(arg) ? arg.getElements() : [arg];
    for (const literal of literals) {
      if (!Node.isStringLiteral(literal) && !Node.isNoSubstitutionTemplateLiteral(literal)) {
        continue;
      }
      const name = literal.getLiteralValue();
      const event = v1Event(toKebab(name));
      if (event === name) {
        continue;
      }
      if (event) {
        literal.setLiteralValue(event);
        changed = true;
      } else {
        warn(
          file.getFilePath(),
          `\`${call.getExpression().getText()}('${name}')\` never ran in v1.`
        );
      }
    }
  }
  return changed;
};
