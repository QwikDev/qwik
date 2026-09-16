import { SyntaxKind, type SourceFile, type TypeReferenceNode } from 'ts-morph';
import { ensureNamedImport } from './utils';

const CORE = '@builder.io/qwik';

type Replacement = { text: (typeArgs: string[]) => string; imports?: string[] };

const jsxTag = (tag: string): Replacement => ({
  text: () => `QwikJSX.IntrinsicElements['${tag}']`,
  imports: ['QwikJSX'],
});
const jsxProp = (tag: string, prop: string): Replacement => ({
  text: () => `NonNullable<QwikJSX.IntrinsicElements['${tag}']['${prop}']>`,
  imports: ['QwikJSX'],
});
const text = (value: string): Replacement => ({ text: () => value });

/** Tags of the v1 `XxxHTMLAttributes` types, from the v1 jsx-generated types. */
const HTML_ATTRIBUTES: Record<string, string> = {
  Anchor: 'a',
  Area: 'area',
  Audio: 'audio',
  Base: 'base',
  Blockquote: 'blockquote',
  Button: 'button',
  Canvas: 'canvas',
  Col: 'col',
  Colgroup: 'colgroup',
  Data: 'data',
  Del: 'del',
  Details: 'details',
  Dialog: 'dialog',
  Embed: 'embed',
  Fieldset: 'fieldset',
  Form: 'form',
  Html: 'html',
  Iframe: 'iframe',
  Img: 'img',
  Hr: 'hr',
  Input: 'input',
  Ins: 'ins',
  Keygen: 'base',
  Label: 'label',
  Li: 'li',
  Link: 'link',
  Map: 'map',
  Menu: 'menu',
  Meta: 'meta',
  Meter: 'meter',
  Object: 'object',
  Ol: 'ol',
  Optgroup: 'optgroup',
  Option: 'option',
  Output: 'output',
  Param: 'base',
  Progress: 'progress',
  Quote: 'q',
  Slot: 'slot',
  Script: 'script',
  Select: 'select',
  Source: 'source',
  Style: 'style',
  Table: 'table',
  Td: 'td',
  Textarea: 'textarea',
  Th: 'tr',
  Time: 'time',
  Title: 'title',
  Track: 'track',
  Video: 'video',
  Media: 'audio',
  '': 'div',
};

const JSX_TYPES: Record<string, Replacement> = {
  ...Object.fromEntries(
    Object.entries(HTML_ATTRIBUTES).map(([name, tag]) => [`${name}HTMLAttributes`, jsxTag(tag)])
  ),
  Booleanish: text('(boolean | `${boolean}`)'),
  Numberish: text('(number | `${number}`)'),
  Size: text('(number | string)'),
  AriaRole: jsxProp('div', 'role'),
  HTMLAttributeAnchorTarget: jsxProp('a', 'target'),
  HTMLAttributeReferrerPolicy: text('ReferrerPolicy'),
  HTMLCrossOriginAttribute: jsxProp('img', 'crossOrigin'),
  HTMLInputTypeAttribute: jsxProp('input', 'type'),
};

/** Replaces references to the imported `names` with their replacement and fixes the imports. */
function replaceTypes(file: SourceFile, replacements: Record<string, Replacement>) {
  let changed = false;
  for (const decl of file.getImportDeclarations()) {
    if (decl.getModuleSpecifierValue() !== CORE) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      const replacement = replacements[named.getName()];
      if (!replacement) {
        continue;
      }
      const local = (named.getAliasNode() ?? named.getNameNode()).getText();
      const refs = file
        .getDescendantsOfKind(SyntaxKind.TypeReference)
        .filter((ref) => ref.getTypeName().getText() === local);
      for (const ref of refs.reverse()) {
        replaceTypeReference(ref, replacement);
      }
      replacement.imports?.forEach((name) => ensureNamedImport(file, CORE, name, true));
      named.remove();
      changed = true;
    }
    if (
      !decl.wasForgotten() &&
      decl.getNamedImports().length === 0 &&
      !decl.getDefaultImport() &&
      !decl.getNamespaceImport()
    ) {
      decl.remove();
    }
  }
  return changed;
}

function replaceTypeReference(ref: TypeReferenceNode, replacement: Replacement) {
  ref.replaceWithText(replacement.text(ref.getTypeArguments().map((t) => t.getText())));
}

/** V2 removed the `XxxHTMLAttributes` and related helper types, the JSX element types replace them. */
export const replaceRemovedJsxTypes = (file: SourceFile) => replaceTypes(file, JSX_TYPES);
