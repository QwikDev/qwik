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

const DOM_EVENTS: Record<string, string> = {
  Animation: 'AnimationEvent',
  Clipboard: 'ClipboardEvent',
  Composition: 'CompositionEvent',
  Drag: 'DragEvent',
  Pointer: 'PointerEvent',
  Focus: 'FocusEvent',
  Keyboard: 'KeyboardEvent',
  Mouse: 'MouseEvent',
  Touch: 'TouchEvent',
  UI: 'UIEvent',
  Wheel: 'WheelEvent',
  Transition: 'TransitionEvent',
};

const EVENT_TYPES: Record<string, Replacement> = {
  ...Object.fromEntries(
    Object.entries(DOM_EVENTS).flatMap(([name, dom]) => [
      [`Native${name}Event`, text(dom)],
      [`Qwik${name}Event`, text(dom)],
    ])
  ),
  // QwikMouseEvent<T, E> is E
  QwikMouseEvent: { text: (args) => args[1] ?? 'MouseEvent' },
  QwikSubmitEvent: text('SubmitEvent'),
  QwikInvalidEvent: text('Event'),
  QwikChangeEvent: text('Event'),
  PropFunction: {
    text: (args) => (args.length ? `QRL<${args.join(', ')}>` : 'QRL'),
    imports: ['QRL'],
  },
};

/** The deprecated `QwikXxxEvent`/`NativeXxxEvent` aliases and `PropFunction` are not public in v2. */
export const replaceEventTypes = (file: SourceFile) => replaceTypes(file, EVENT_TYPES);

/** V1 public exports that v2 only exposes from `@qwik.dev/core/internal`. */
const INTERNAL = new Set([
  ...['componentQrl', 'createComputedQrl', 'eventQrl', 'qrl', 'useComputedQrl', 'useResourceQrl'],
  ...['useStylesQrl', 'useStylesScopedQrl', 'useTaskQrl', 'useVisibleTaskQrl', '_qrlSync'],
  ...['h', 'createElement', 'setPlatform', 'unwrapStore', 'useLexicalScope'],
  ...['SSRComment', 'SSRHintProps', 'SSRRaw', 'SSRStream', 'SSRStreamBlock', 'SSRStreamProps'],
  ...['ComponentBaseProps', 'ComputedFn', 'CorePlatform', 'CorrectedToggleEvent', 'DOMAttributes'],
  ...['DevJSX', 'JSXTagName', 'KnownEventNames', 'OnRenderFn', 'PublicProps', 'QwikAttributes'],
  ...['QwikDOMAttributes', 'QwikIdleEvent', 'QwikInitEvent', 'QwikSymbolEvent', 'RenderResult'],
  ...['RenderSSROptions', 'ResourceCtx', 'ResourceFn', 'ResourceOptions', 'ResourcePending'],
  ...['ResourceProps', 'ResourceRejected', 'ResourceResolved', 'SnapshotListener', 'SnapshotMeta'],
  ...['SnapshotMetaValue', 'SnapshotResult', 'SnapshotState', 'StreamWriter', 'SyncQRL', 'TaskFn'],
  ...['Tracker', 'UseSignal', 'UseStoreOptions', 'UseStylesScoped', 'VisibleTaskStrategy'],
]);

/** Moves imports of APIs that are no longer public to `@qwik.dev/core/internal`. */
export const moveInternalImports = (file: SourceFile) => {
  let changed = false;
  for (const decl of file.getImportDeclarations()) {
    if (decl.getModuleSpecifierValue() !== CORE) {
      continue;
    }
    const internal = decl.getNamedImports().filter((n) => INTERNAL.has(n.getName()));
    if (internal.length === 0) {
      continue;
    }
    const names = internal.map((n) => n.getText());
    const typeOnly = decl.isTypeOnly() ? 'type ' : '';
    internal.forEach((n) => n.remove());
    const newImport = `import ${typeOnly}{ ${names.join(', ')} } from '${CORE}/internal';`;
    if (decl.getNamedImports().length === 0 && !decl.getDefaultImport()) {
      decl.replaceWithText(newImport);
    } else {
      file.insertStatements(decl.getChildIndex() + 1, newImport);
    }
    changed = true;
  }
  return changed;
};

/**
 * `ReadonlySignal<T>` was `Readonly<Signal<T>>` in v1. In v2 it is a deprecated interface with only
 * `value`, which is no longer assignable to `Signal`.
 */
export const replaceReadonlySignal = (file: SourceFile) =>
  replaceTypes(file, {
    ReadonlySignal: {
      text: (args) => `Readonly<Signal${args.length ? `<${args.join(', ')}>` : ''}>`,
      imports: ['Signal'],
    },
  });
