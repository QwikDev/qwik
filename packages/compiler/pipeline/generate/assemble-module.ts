import {
  AssemblyKind,
  SurfaceKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlDeclaration,
} from '../schema';
import { QWIK_CORE_IMPORT } from '../words';
import { assembleModule, type AssembledModule } from '../../src/module-assembly';
import type { SourceMap } from 'oxc-transform';
import { emitQrlChunks, type FunctionEmission } from './emit-chunk';
import type { GenerateOutput, PresentationOptions } from './output';
import {
  allocateGeneratedNames,
  emitComponentFunction,
  type ComponentEmission,
  type GeneratedNames,
} from './emit-component';

/** Insertion order IS the emitted import order. */
export interface ModuleParts {
  imports: Set<string>;
  chunkImports: string[];
  hoists: string[];
}

export interface QwikModuleEmitter extends ModuleParts {
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
  const assembled = assembleQwikModule(
    module,
    emitter,
    (qrl, names) => emitter.emitProgram(qrl, names),
    options,
    placement
  );
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
    ...emitQrlChunks(module, (qrl) => emitter.resolveChunkUses(emitter.qrlFunction(qrl)), options),
  ];
}

/**
 * Walks the module's assembly intents, splicing each component's emission over its replacement
 * range; collected imports and hoists attach in front of the first component edit.
 */
export function assembleQwikModule(
  module: LinkedModule,
  parts: ModuleParts,
  emitProgram: (qrl: LinkedQrl, names: GeneratedNames) => ComponentEmission,
  options: PresentationOptions,
  /** SSR glues imports/hoists at the component edit; CSR puts them at the top of the module. */
  placement: 'component' | 'module-top' = 'component'
): AssembledModule {
  const names = allocateGeneratedNames(module);
  const edits: { range: [number, number]; text: string }[] = [];
  let firstComponentEdit: { range: [number, number]; text: string } | null = null;
  for (const intent of module.assembly) {
    switch (intent.a) {
      case AssemblyKind.StripRange:
        edits.push({ range: intent.range, text: '' });
        break;
      case AssemblyKind.Splice: {
        const qrl = module.qrls[intent.qrl];
        const declaration = qrl.declaration;
        if (declaration === undefined) {
          throw new Error(`pipeline: a splice intent on the undeclared qrl "${qrl.id}"`);
        }
        const componentNames = {
          ...names,
          props: authoredPropsName(module, declaration) ?? names.props,
        };
        const edit = {
          range: declaration.replacementRange,
          text: emitComponentFunction(qrl, emitProgram(qrl, componentNames), componentNames),
        };
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
    const coreEdge = module.edges.find((edge) => edge.specifier.startsWith(QWIK_CORE_IMPORT));
    let hoists = parts.hoists;
    if (coreEdge !== undefined && parts.imports.size > 0) {
      // Module-top hoists follow the replaced import, keeping the authored statement order.
      const inlineHoists = placement === 'module-top' ? hoists : [];
      // A chunk-import block ends with a blank line before the hoists; a lone core import does not.
      const hoistSeparator = parts.chunkImports.length > 0 ? '\n\n' : '\n';
      edits.push({
        range: coreEdge.ownerRange,
        text:
          inlineHoists.length === 0
            ? importLines.join('\n')
            : `${importLines.join('\n')}${hoistSeparator}${inlineHoists.join('\n')}`,
      });
      header = '';
      hoists = placement === 'module-top' ? [] : hoists;
    }
    if (placement === 'module-top') {
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
  return assembleModule(
    module.source.code,
    module.source.originalPath,
    module.path,
    edits.map((edit) => ({ range: edit.range, value: edit.text })),
    options.outputSourceMaps === true,
    module.source.normalizationMap as SourceMap | null
  );
}

function authoredPropsName(module: LinkedModule, declaration: QrlDeclaration): string | null {
  const surface = declaration.parameter?.surface;
  return surface?.kind === SurfaceKind.Identifier ? module.bindings[surface.binding].name : null;
}
