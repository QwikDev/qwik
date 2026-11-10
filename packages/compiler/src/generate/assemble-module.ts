import {
  AssemblyKind,
  DeclarationKind,
  DeliveryKind,
  type HookDecl,
  type LinkedModule,
  type LinkedQrl,
  type QrlDeclaration,
  StripValueForm,
} from '../schema';
import { EsmEdgeKind } from '../schema';
import { QWIK_CORE_IMPORT } from '../words';
import { assembleModule, type AssembledModule } from './source-assembly';
import type { SourceMap } from 'oxc-transform';
import { type FunctionEmission } from './emit-function';
import {
  chunkSymbolName,
  componentSegmentImport,
  componentSegmentsByBinding,
  emitQrlChunks,
  isComponentSegment,
} from './qrl-chunks';
import { planModuleBindingExports, replacedCoreImports, requestBindingImport } from './emit-import';
import { type GenerateOutput, type PresentationOptions } from './output';
import {
  allocateGeneratedNames,
  emitComponentAlias,
  emitComponentFunction,
  type ComponentEmission,
  type GeneratedNames,
} from './emit-component';

const STRIPPED_EXPORT_THROW =
  "throw new Error('This server-only export is not available in the browser.');";

/** What replaces a stripped export's initializer or function body. */
export function strippedValueJs(form: StripValueForm): string {
  return form === StripValueForm.Body
    ? `{ ${STRIPPED_EXPORT_THROW} }`
    : `() => { ${STRIPPED_EXPORT_THROW} }`;
}

/** Insertion order IS the emitted import order. */
export interface QwikModuleEmitter {
  imports: Set<string>;
  chunkImports: string[];
  hoists: string[];
  emitPayload(payload: number, names: GeneratedNames): string;
  /** A custom hook's compiled body, replacing the authored one. */
  emitHook(hook: HookDecl, names: GeneratedNames): string;
  emitProgram(qrl: LinkedQrl, names: GeneratedNames): ComponentEmission;
  /** Every QRL's function as one context-neutral emission — every placement prints it. */
  qrlFunction(qrl: LinkedQrl): FunctionEmission;
  /** Satisfy the emission's QRL uses for a standalone chunk file (target policy). */
  resolveChunkUses(emission: FunctionEmission): FunctionEmission;
}

/** The main module (assembled over the source) plus one chunk per QRL. */
export function generateQwikModule(
  module: LinkedModule,
  emitter: QwikModuleEmitter,
  options: PresentationOptions,
  placement: 'component' | 'module-top' = 'component'
): GenerateOutput['modules'] {
  const segments = componentSegmentsByBinding(module);
  const bindingExports = planModuleBindingExports(module, new Set(segments.keys()));
  const assembled = assembleQwikModule(module, emitter, options, placement, bindingExports.code);
  const main = {
    path: module.path,
    code: assembled.code,
    map: assembled.map,
    isEntry: false,
    origPath: null,
    imports: strippedBodyImports(module),
    segment: null,
  };
  return [
    main,
    ...emitQrlChunks(
      module,
      (qrl) => emitter.resolveChunkUses(emitter.qrlFunction(qrl)),
      options,
      bindingExports.names,
      segments
    ),
  ];
}

/** A stripped body vanishes with its imports, yet the build must still follow those edges. */
function strippedBodyImports(module: LinkedModule): string[] {
  const edges = new Set<number>();
  for (const qrl of module.qrls) {
    if (qrl.delivery.d !== DeliveryKind.Stripped) {
      continue;
    }
    for (const binding of qrl.dependencies.bindings) {
      const source = module.imports.find((entry) => entry.source.binding === binding)?.source;
      if (source !== undefined && !source.typeOnly) {
        edges.add(source.edge);
      }
    }
    // An `import()` inside the stripped body vanishes with it, yet the server-fn walk needs it.
    const [start, end] = qrl.origin.bodyRange;
    module.edges.forEach((edge, index) => {
      if (
        edge.kind === EsmEdgeKind.DynamicLiteral &&
        edge.ownerRange[0] >= start &&
        edge.ownerRange[1] <= end
      ) {
        edges.add(index);
      }
    });
  }
  return [...edges].map((edge) => module.edges[edge].specifier);
}

/** Splice components and helper payloads, then attach imports and hoists. */
export function assembleQwikModule(
  module: LinkedModule,
  parts: QwikModuleEmitter,
  options: PresentationOptions,
  /** SSR glues imports/hoists at the component edit; CSR puts them at the top of the module. */
  placement: 'component' | 'module-top',
  bindingExports: string
): AssembledModule {
  const names = allocateGeneratedNames(module);
  const edits: { range: [number, number]; text: string }[] = [];
  let firstComponentEdit: { range: [number, number]; text: string } | null = null;
  let needsModulePrelude = false;
  for (const intent of module.assembly) {
    switch (intent.a) {
      case AssemblyKind.Payload:
        needsModulePrelude = true;
        edits.push({
          range: module.payloads[intent.payload].range,
          text: parts.emitPayload(intent.payload, names),
        });
        break;
      case AssemblyKind.Hook: {
        const hook = module.hooks[intent.hook];
        needsModulePrelude ||= hook.declarationKind === DeclarationKind.Function;
        edits.push({ range: hook.range, text: parts.emitHook(hook, names) });
        for (const binding of hook.dependencies.bindings) {
          requestBindingImport(module, binding, parts.imports);
        }
        break;
      }
      case AssemblyKind.Import:
        if (intent.binding !== null) {
          requestBindingImport(module, intent.binding, parts.imports);
        }
        break;
      case AssemblyKind.NativeMarker: {
        // Build-time only: the call goes, its JS implementation stays the module's value.
        const native = module.natives[intent.native];
        edits.push({
          range: native.markerRange,
          text: parts.emitPayload(native.jsImplementation, names),
        });
        break;
      }
      case AssemblyKind.StripRange:
        edits.push({ range: intent.range, text: '' });
        break;
      case AssemblyKind.StripValue:
        edits.push({ range: intent.range, text: strippedValueJs(intent.form) });
        break;
      case AssemblyKind.Splice: {
        const qrl = module.qrls[intent.qrl];
        const declaration = qrl.declaration;
        if (declaration === undefined) {
          throw new Error(`pipeline: a splice intent on the undeclared qrl "${qrl.id}"`);
        }
        if (isComponentSegment(qrl)) {
          const { importLine, text } = componentSegmentReference(module, qrl, options);
          parts.chunkImports.push(importLine);
          const edit = { range: declaration.replacementRange, text };
          edits.push(edit);
          firstComponentEdit ??= edit;
          break;
        }
        needsModulePrelude ||=
          declaration.expressionOnly === true ||
          declaration.declarationKind === DeclarationKind.Function ||
          declaration.declarationKind === DeclarationKind.DefaultFunction;
        const componentNames = {
          ...names,
          props: componentPropsName(module, declaration) ?? names.props,
        };
        const text =
          qrl.aliasOf === undefined
            ? emitComponentFunction(qrl, parts.emitProgram(qrl, componentNames), componentNames)
            : emitComponentAlias(qrl, module.bindings[qrl.aliasOf].name);
        const edit = { range: declaration.replacementRange, text };
        for (const binding of qrl.aliasOf === undefined ? qrl.dependencies.bindings : []) {
          requestBindingImport(module, binding, parts.imports);
        }
        edits.push(edit);
        firstComponentEdit ??= edit;
        break;
      }
      default:
        throw new Error(`pipeline: assembly intent "${intent.a}" not implemented yet`);
    }
  }
  let prefix = '';
  if (parts.imports.size > 0 || parts.chunkImports.length > 0 || parts.hoists.length > 0) {
    const importLines = [
      ...(parts.imports.size === 0
        ? []
        : [
            `import { ${[...parts.imports].join(', ')} } from ${JSON.stringify(QWIK_CORE_IMPORT)};`,
          ]),
      ...parts.chunkImports,
    ];
    let header = importLines.length === 0 ? '' : `${importLines.join('\n')}\n\n`;
    // An authored core import is replaced in place (authored names merge into the request set);
    // otherwise the header block is synthesized in front of the component.
    const coreEdges = replacedCoreImports(module);
    const coreEdge = coreEdges[0];
    let hoists = parts.hoists;
    if (coreEdge !== undefined) {
      // Module-top hoists follow the replaced import, keeping the authored statement order.
      const inlineHoists = placement === 'module-top' && !needsModulePrelude ? hoists : [];
      // A chunk-import block ends with a blank line before the hoists; a lone core import does not.
      const hoistSeparator = parts.chunkImports.length > 0 ? '\n\n' : '\n';
      edits.push({
        range: coreEdge.ownerRange,
        text:
          inlineHoists.length === 0
            ? importLines.join('\n')
            : `${importLines.join('\n')}${hoistSeparator}${inlineHoists.join('\n')}`,
      });
      for (const extraCoreEdge of coreEdges.slice(1)) {
        if (extraCoreEdge.ownerRange[0] !== extraCoreEdge.ownerRange[1]) {
          edits.push({ range: extraCoreEdge.ownerRange, text: '' });
        }
      }
      header = '';
      if (inlineHoists.length > 0) {
        hoists = [];
      }
    }
    // Hoisted components and initializer edits need a module-level prelude.
    // A module without a component (hooks, helpers) takes the prelude at its top like a chunk.
    if (placement === 'module-top' || needsModulePrelude || firstComponentEdit === null) {
      prefix = `${header}${hoists.join('\n')}${hoists.length > 0 ? '\n' : ''}`;
    } else {
      firstComponentEdit.text = `${header}${[...hoists, firstComponentEdit.text].join('\n')}`;
    }
  }
  if (prefix !== '') {
    edits.push({ range: [0, 0], text: prefix });
  }
  if (bindingExports !== '') {
    const end = module.source.code.length;
    edits.push({ range: [end, end], text: bindingExports });
  }
  return assembleModule(
    module.source.code,
    module.source.originalPath,
    module.path,
    edits.map((edit) => ({ range: edit.range, value: edit.text })),
    options.outputSourceMaps === true,
    module.source.normalizationMap as SourceMap | null
  );
}

/** The parent imports a component segment under its authored name and keeps its export. */
function componentSegmentReference(
  module: LinkedModule,
  qrl: LinkedQrl,
  options: PresentationOptions
): { importLine: string; text: string } {
  const declaration = qrl.declaration!;
  const symbol = chunkSymbolName(qrl);
  const isDefault =
    declaration.declarationKind === DeclarationKind.DefaultArrow ||
    declaration.declarationKind === DeclarationKind.DefaultFunction;
  const name =
    declaration.declarationKind === DeclarationKind.DefaultArrow
      ? symbol
      : declaration.declarationKind === DeclarationKind.DefaultFunction
        ? (declaration.localName ?? symbol)
        : declaration.name;
  return {
    importLine: componentSegmentImport(module, qrl, name, options),
    text: isDefault
      ? `export { ${name} as default };`
      : declaration.isExported
        ? `export { ${name} };`
        : '',
  };
}

function componentPropsName(module: LinkedModule, declaration: QrlDeclaration): string | null {
  const surface = declaration.parameter?.surface;
  return surface?.binding == null ? null : module.bindings[surface.binding].name;
}
