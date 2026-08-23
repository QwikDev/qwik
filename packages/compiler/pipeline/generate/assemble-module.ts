import { AssemblyKind, SurfaceKind, type ComponentDecl, type LinkedModule } from '../schema';
import { QWIK_CORE_IMPORT } from '../words';
import {
  allocateGeneratedNames,
  emitComponentFunction,
  type ComponentEmission,
  type GeneratedNames,
} from './emit-component';

/** Insertion order IS the emitted import order. */
export interface ModuleParts {
  imports: Set<string>;
  hoists: string[];
}

/**
 * Walks the module's assembly intents, splicing each component's emission over its replacement
 * range; collected imports and hoists attach in front of the (single) component edit.
 */
export function assembleQwikModule(
  module: LinkedModule,
  parts: ModuleParts,
  emitProgram: (component: ComponentDecl, names: GeneratedNames) => ComponentEmission,
  /** SSR glues imports/hoists at the component edit; CSR puts them at the top of the module. */
  placement: 'component' | 'module-top' = 'component'
): string {
  const names = allocateGeneratedNames(module);
  const edits: { range: [number, number]; text: string }[] = [];
  const componentEdits: { range: [number, number]; text: string }[] = [];
  for (const intent of module.assembly) {
    switch (intent.a) {
      case AssemblyKind.StripRange:
        edits.push({ range: intent.range, text: '' });
        break;
      case AssemblyKind.Component: {
        const component = module.components[intent.component];
        const componentNames = {
          ...names,
          props: authoredPropsName(module, component) ?? names.props,
        };
        const edit = {
          range: component.replacementRange,
          text: emitComponentFunction(
            component,
            emitProgram(component, componentNames),
            componentNames
          ),
        };
        edits.push(edit);
        componentEdits.push(edit);
        break;
      }
      default:
        throw new Error(`pipeline: assembly intent "${intent.a}" not implemented yet`);
    }
  }
  let prefix = '';
  if (parts.imports.size > 0 || parts.hoists.length > 0) {
    const importLine =
      parts.imports.size === 0
        ? ''
        : `import { ${[...parts.imports].join(', ')} } from ${JSON.stringify(QWIK_CORE_IMPORT)};\n\n`;
    if (placement === 'module-top') {
      prefix = `${importLine}${parts.hoists.join('\n')}${parts.hoists.length > 0 ? '\n' : ''}`;
    } else {
      if (componentEdits.length !== 1) {
        throw new Error('pipeline: imports/hoists in a module with more than one component');
      }
      componentEdits[0].text = `${importLine}${[...parts.hoists, componentEdits[0].text].join('\n')}`;
    }
  }
  edits.sort((a, b) => b.range[0] - a.range[0]);
  let code = module.source.code;
  for (const edit of edits) {
    code = code.slice(0, edit.range[0]) + edit.text + code.slice(edit.range[1]);
  }
  return prefix + code;
}

function authoredPropsName(module: LinkedModule, component: ComponentDecl): string | null {
  const surface = component.parameter?.surface;
  return surface?.kind === SurfaceKind.Identifier ? module.bindings[surface.binding].name : null;
}
