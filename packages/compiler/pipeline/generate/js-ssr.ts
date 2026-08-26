/** `generateJsSsr(serverLinkedPlan, options)` — the baseline generator over the server LinkedPlan. */
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
import { QwikGenWord, QwikWord } from '../words';
import { escapeAttr, serializeAttrValue } from '../html';
import { UnsupportedError } from '../errors';
import { generateQwikModule } from './assemble-module';
import { captureNames, chunkFunctionText } from './emit-chunk';
import { emitJsSetup, signalReadName } from './emit-setup';
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

interface QrlUsage {
  qrl: LinkedQrl;
  /** Invoked segments (render expressions) get an in-module mirror registered via `.s()`. */
  invoked: boolean;
}

class SsrModuleEmitter {
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly usedQrls = new Map<string, QrlUsage>();
  private statements: string[] = [];
  private asyncSteps: string[] = [];
  private idCount = 0;
  private tempCount = 0;
  private names!: GeneratedNames;

  constructor(private readonly module: LinkedModule) {}

  emitProgram(component: ComponentDecl, names: GeneratedNames): ComponentEmission {
    const body = this.module.programs[component.body].body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new Error('pipeline.generateJsSsr: js-bodied programs not implemented yet');
    }
    this.names = names;
    this.statements = emitJsSetup(this.module, this.module.programs[component.body], this.imports);
    this.asyncSteps = [];
    this.idCount = 0;
    this.tempCount = 0;
    const parts: string[] = [];
    for (const op of body.ops) {
      this.op(op, parts);
    }
    let value = parts.length === 0 ? "''" : parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    if (this.asyncSteps.length > 0) {
      this.imports.add(QwikWord.MaybeThen);
      value = this.asyncSteps.reduceRight(
        (inner, step) => `${QwikWord.MaybeThen}(${step}, (${step}) => ${inner})`,
        value
      );
    }
    // QRL hoists flush after the body so their imports keep the request order.
    this.flushQrlHoists();
    return { statements: this.statements, value };
  }

  private op(op: Op, parts: string[]): void {
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
        this.element(op, parts);
        return;
      default:
        throw new Error(`pipeline.generateJsSsr: op "${op.op}" not implemented yet`);
    }
  }

  private element(op: Extract<Op, { op: OpKind.Element }>, parts: string[]): void {
    const holes = op.children.filter((child) => child.op === OpKind.Hole);
    const idVariable = holes.length > 0 ? `${QwikGenWord.Id}_${this.idCount++}` : null;
    if (idVariable !== null) {
      // One eager step only, so the id allocates right here; lazy `??=` claiming returns with
      // the multi-step example.
      this.statements.push(`const ${idVariable} = ${this.names.ctx}.nextId();`);
    }
    const open: string[] = [];
    pushMergedStatic(open, `<${op.tag}`);
    if (idVariable !== null) {
      this.imports.add(QwikWord.CreateSsrNodeId);
      pushMergedStatic(open, ` q:id="`);
      open.push(`${QwikWord.CreateSsrNodeId}(${idVariable})`);
      pushMergedStatic(open, `"`);
    }
    for (const prop of op.props) {
      this.prop(prop, open);
    }
    open.push(JSON.stringify('>'));
    this.imports.add(QwikWord.CreateSsrOpenTag);
    parts.push(`${QwikWord.CreateSsrOpenTag}(${open.join(', ')})`);

    let textRangeCount = 0;
    for (const child of op.children) {
      switch (child.op) {
        case OpKind.Static: {
          pushMergedStatic(parts, foldStaticOp(child, false));
          break;
        }
        case OpKind.Hole: {
          this.textHole(child, idVariable!, parts, op.children.length > 1, textRangeCount++);
          break;
        }
        default: {
          if (!isFullyStaticSubtree(child)) {
            throw new UnsupportedError('a dynamic child inside an element record');
          }
          pushMergedStatic(parts, foldStaticOp(child, false));
        }
      }
    }
    if (!op.void) {
      pushMergedStatic(parts, `</${op.tag}>`);
    }
  }

  private textHole(
    op: Extract<Op, { op: OpKind.Hole }>,
    idVariable: string,
    parts: string[],
    hasSiblings: boolean,
    textRangeCount: number
  ): void {
    this.imports.add(
      hasSiblings ? QwikWord.CreateSsrRangeTextTarget : QwikWord.CreateSsrElementTextTarget
    );
    this.imports.add(QwikWord.EscapeHTML);
    const step = `${QwikGenWord.Text}_${this.tempCount++}`;

    if (hasSiblings) {
      pushMergedStatic(parts, '<!t>');
    }

    switch (op.value.v) {
      case ValueKind.Read: {
        // Signal reads subscribe directly — no QRL involved.
        const signal = signalReadName(this.module, op.value.expr);
        this.imports.add(QwikWord.RenderSsrTextNode);
        const createTextFn = hasSiblings
          ? `${QwikWord.CreateSsrRangeTextTarget}(${idVariable}, ${textRangeCount})`
          : `${QwikWord.CreateSsrElementTextTarget}(${idVariable})`;
        this.pushStep(step, [signal], `${QwikWord.RenderSsrTextNode}(${createTextFn}, ${signal})`);
        parts.push(`${QwikWord.EscapeHTML}(${step})`);
        break;
      }
      case ValueKind.Computed: {
        if (!('qrl' in op.value.resume)) {
          throw new UnsupportedError('a non-QRL computed text hole');
        }
        const qrl = this.qrlById(op.value.resume.qrl.qrl);
        const captures = captureNames(this.module, qrl);
        this.imports.add(QwikWord.RenderSsrTextExpression);
        const createTextFn = hasSiblings
          ? `${QwikWord.CreateSsrRangeTextTarget}(${idVariable}, ${textRangeCount})`
          : `${QwikWord.CreateSsrElementTextTarget}(${idVariable})`;
        this.pushStep(
          step,
          captures,
          `${QwikWord.RenderSsrTextExpression}(${createTextFn}, [${captures.join(', ')}], ${this.qrlReference(qrl, true)})`
        );
        parts.push(`${QwikWord.EscapeHTML}(${step})`);
        break;
      }
      default: {
        throw new UnsupportedError('a non-computed text hole');
      }
    }

    if (hasSiblings) {
      pushMergedStatic(parts, '<!/t>');
    }
  }

  /** Every step evaluates eagerly before the first await (see the divergence ledger). */
  private pushStep(step: string, roots: readonly string[], callExpr: string): void {
    for (const root of roots) {
      this.statements.push(`${this.names.ctx}.addRoot(${root});`);
    }
    this.statements.push(`const ${step} = ${callExpr};`);
    this.asyncSteps.push(step);
  }

  private qrlById(id: string): LinkedQrl {
    const qrl = this.module.qrls.find((candidate) => candidate.id === id);
    if (qrl === undefined) {
      throw new Error(`pipeline.generateJsSsr: unknown qrl "${id}"`);
    }
    return qrl;
  }

  private prop(prop: Prop, open: string[]): void {
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
          const qrl = this.qrlById(handler.value.use.qrl);
          const reference = this.qrlReference(qrl);
          const captures = captureNames(this.module, qrl);
          return captures.length === 0 ? reference : `${reference}.w([${captures.join(', ')}])`;
        });
        const value = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
        open.push(`${this.names.ctx}.eventAttr(${JSON.stringify(prop.name)}, ${value})`);
        return;
      }
      default:
        throw new UnsupportedError(`the prop "${prop.k}" in an SSR element record`);
    }
  }

  private qrlReference(qrl: LinkedQrl, invoked = false): string {
    const usage = this.usedQrls.get(qrl.id);
    if (usage === undefined) {
      this.usedQrls.set(qrl.id, { qrl, invoked });
    } else {
      usage.invoked = usage.invoked || invoked;
    }
    return `q_${qrl.name}`;
  }

  private flushQrlHoists(): void {
    for (const usage of this.usedQrls.values()) {
      const { qrl } = usage;
      if (usage.invoked) {
        // The server invokes render expressions in-module: mirror fn + `.s()` registration.
        this.hoists.push(`const ${qrl.name} = ${chunkFunctionText(this.module, qrl)};`);
        this.imports.add(QwikWord.NoopQrl);
        this.hoists.push(
          `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(qrl.name)});`
        );
        this.hoists.push(`q_${qrl.name}.s(${qrl.name});`);
      } else {
        this.imports.add(QwikWord.NoopQrl);
        this.hoists.push(
          `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(qrl.name)});`
        );
      }
    }
    this.usedQrls.clear();
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
