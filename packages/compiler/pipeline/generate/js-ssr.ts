/**
 * `generateJsSsr(serverLinkedPlan, options)` — the baseline generator; consumes the exact same
 * server LinkedPlan as `generateRustSsr` (DESIGN.md rule 5).
 */
import {
  Environment,
  HandlerKind,
  ModuleKind,
  OpKind,
  PropKind,
  ProgramBodyKind,
  ValueKind,
  type ComponentDecl,
  type LinkedModule,
  type LinkedPlan,
  type LinkedQrl,
  type Op,
  type Prop,
} from '../schema';
import { QwikWord } from '../words';
import { escapeAttr, serializeAttrValue } from '../html';
import { UnsupportedError } from '../errors';
import { generateQwikModule } from './assemble-module';
import { foldStaticOp, isFullyStaticSubtree } from './fold-static';
import type { ComponentEmission, GeneratedNames } from './emit-component';
import { generateForeignModule } from './foreign';
import { makeOutput, type GenerateOutput, type PresentationOptions } from './output';

export async function generateJsSsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Server) {
    throw new Error('generateJsSsr requires a server LinkedPlan');
  }
  const modules: GenerateOutput['modules'] = [];
  for (const module of plan.modules) {
    modules.push(...(await generateModule(module, options)));
  }
  return makeOutput(plan, modules);
}

async function generateModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules']> {
  switch (module.kind) {
    case ModuleKind.Foreign:
      return [await generateForeignModule(module, options)];
    case ModuleKind.Qwik:
      return generateQwikModule(module, new SsrModuleEmitter(module));
    case ModuleKind.ExportsOnly:
    case ModuleKind.Failed:
      throw new Error(
        `pipeline.generateJsSsr: ${module.kind} modules not implemented yet (slice 1): ${module.path}`
      );
  }
}

class SsrModuleEmitter {
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly hoistedQrls = new Set<string>();

  constructor(private readonly module: LinkedModule) {}

  emitProgram(component: ComponentDecl, names: GeneratedNames): ComponentEmission {
    const body = this.module.programs[component.body].body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new Error('pipeline.generateJsSsr: js-bodied programs not implemented yet');
    }
    const parts: string[] = [];
    for (const op of body.ops) {
      this.op(op, parts, names);
    }
    const value =
      parts.length === 0 ? "''" : parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    // QRL hoists flush after the body so their imports keep the request order.
    this.flushQrlHoists();
    return { statements: [], value };
  }

  private op(op: Op, parts: string[], names: GeneratedNames): void {
    switch (op.op) {
      case OpKind.Static:
        // SSR streams raw text; adjacent static runs merge into one string part.
        pushMergedStatic(parts, foldStaticOp(op, false));
        return;
      case OpKind.Element:
        if (isFullyStaticSubtree(op)) {
          pushMergedStatic(parts, foldStaticOp(op, false));
          return;
        }
        this.element(op, parts, names);
        return;
      default:
        throw new Error(`pipeline.generateJsSsr: op "${op.op}" not implemented yet`);
    }
  }

  private element(
    op: Extract<Op, { op: OpKind.Element }>,
    parts: string[],
    names: GeneratedNames
  ): void {
    const open: string[] = [];
    pushMergedStatic(open, `<${op.tag}`);
    for (const prop of op.props) {
      this.prop(prop, open, names);
    }
    open.push(JSON.stringify('>'));
    this.imports.add(QwikWord.CreateSsrElementRecord);
    parts.push(`${QwikWord.CreateSsrElementRecord}(${JSON.stringify(op.tag)}, ${open.join(', ')})`);
    for (const child of op.children) {
      if (!isFullyStaticSubtree(child)) {
        throw new UnsupportedError('a dynamic child inside an element record');
      }
      pushMergedStatic(parts, foldStaticOp(child, false));
    }
    if (!op.void) {
      pushMergedStatic(parts, `</${op.tag}>`);
    }
  }

  private prop(prop: Prop, open: string[], names: GeneratedNames): void {
    switch (prop.k) {
      case PropKind.Static: {
        const serialized = serializeAttrValue(prop.name, prop.value ?? null);
        if (serialized === null) {
          return;
        }
        pushMergedStatic(
          open,
          serialized === '' ? ` ${prop.name}` : ` ${prop.name}="${escapeAttr(serialized)}"`
        );
        return;
      }
      case PropKind.Event: {
        const values = prop.handlers.map((handler) => {
          if (handler.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
            throw new UnsupportedError('a non-QRL event handler');
          }
          return this.qrlReference(handler.value.use.qrl);
        });
        const value = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
        open.push(`${names.ctx}.eventAttr(${JSON.stringify(prop.name)}, ${value})`);
        return;
      }
      default:
        throw new UnsupportedError(`the prop "${prop.k}" in an SSR element record`);
    }
  }

  private qrlReference(id: string): string {
    const qrl = this.module.qrls.find((candidate) => candidate.id === id);
    if (qrl === undefined) {
      throw new Error(`pipeline.generateJsSsr: unknown qrl "${id}"`);
    }
    this.hoistedQrls.add(qrl.id);
    return `q_${qrl.name}`;
  }

  private flushQrlHoists(): void {
    for (const id of this.hoistedQrls) {
      const qrl = this.module.qrls.find((candidate) => candidate.id === id) as LinkedQrl;
      this.imports.add(QwikWord.NoopQrl);
      this.hoists.push(
        `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(qrl.name)});`
      );
    }
    this.hoistedQrls.clear();
  }
}

function pushMergedStatic(parts: string[], text: string): void {
  const last = parts[parts.length - 1];
  if (last !== undefined && last.startsWith('"')) {
    parts[parts.length - 1] = JSON.stringify((JSON.parse(last) as string) + text);
  } else {
    parts.push(JSON.stringify(text));
  }
}
