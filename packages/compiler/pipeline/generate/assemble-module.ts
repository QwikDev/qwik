import {
  AssemblyKind,
  DeclarationKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlDeclaration,
} from '../schema';
import { QWIK_CORE_IMPORT } from '../words';
import { assembleModule, type AssembledModule } from '../../src/module-assembly';
import type { SourceMap } from 'oxc-transform';
import { emitQrlChunks, type FunctionEmission } from './emit-chunk';
import { planModuleBindingExports, replacedCoreImports, requestBindingImport } from './emit-import';
import type { GenerateOutput, PresentationOptions } from './output';
import {
  allocateGeneratedNames,
  emitComponentFunction,
  type ComponentEmission,
  type GeneratedNames,
} from './emit-component';

/** Insertion order IS the emitted import order. */
export interface QwikModuleEmitter {
  imports: Set<string>;
  chunkImports: string[];
  hoists: string[];
  emitPayload(payload: number, names: GeneratedNames): string;
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
  const bindingExports = planModuleBindingExports(module);
  const assembled = assembleQwikModule(module, emitter, options, placement, bindingExports.code);
  const main = {
    path: module.path,
    code: assembled.code,
    map: assembled.map,
    isEntry: false,
    origPath: null,
    segment: null,
  };
  return [
    main,
    ...emitQrlChunks(
      module,
      (qrl) => emitter.resolveChunkUses(emitter.qrlFunction(qrl)),
      options,
      bindingExports.names
    ),
  ];
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
      case AssemblyKind.Import:
        if (intent.binding !== null) {
          requestBindingImport(module, intent.binding, parts.imports);
        }
        break;
      case AssemblyKind.StripRange:
        edits.push({ range: intent.range, text: '' });
        break;
      case AssemblyKind.Splice: {
        const qrl = module.qrls[intent.qrl];
        const declaration = qrl.declaration;
        if (declaration === undefined) {
          throw new Error(`pipeline: a splice intent on the undeclared qrl "${qrl.id}"`);
        }
        needsModulePrelude ||=
          declaration.expressionOnly === true ||
          declaration.declarationKind === DeclarationKind.Function ||
          declaration.declarationKind === DeclarationKind.DefaultFunction;
        const componentNames = {
          ...names,
          props: componentPropsName(module, declaration) ?? names.props,
        };
        const edit = {
          range: declaration.replacementRange,
          text: emitComponentFunction(qrl, parts.emitProgram(qrl, componentNames), componentNames),
        };
        for (const binding of qrl.dependencies.bindings) {
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
    if (coreEdge !== undefined && parts.imports.size > 0) {
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
    if (placement === 'module-top' || needsModulePrelude) {
      prefix = `${header}${hoists.join('\n')}${hoists.length > 0 ? '\n' : ''}`;
    } else {
      if (firstComponentEdit === null) {
        throw new Error('pipeline: imports/hoists without a component');
      }
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

function componentPropsName(module: LinkedModule, declaration: QrlDeclaration): string | null {
  const surface = declaration.parameter?.surface;
  return surface?.binding == null ? null : module.bindings[surface.binding].name;
}
