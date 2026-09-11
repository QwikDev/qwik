import {
  ArgPass,
  BoundaryKind,
  CaptureAccess,
  DeliveryKind,
  FnBodyKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  ResumeKind,
  SeedKind,
  Shape,
  ValueKind,
  ExprKind,
  type LinkedModule,
  type LinkedOp,
  type LinkedQrl,
  type QrlUse,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { createSegmentSourceIdentity, createSegmentSymbolName } from '../segment-identity';
import { collectQrlDependencies } from './qrl-dependencies';

/** Final render strategy selection shares the existing content operation and ABI. */
export function linkContent(module: LinkedModule): void {
  let ordinal = 0;
  const scan = (op: LinkedOp): void => {
    if (op.op === OpKind.Element) {
      op.children.forEach(scan);
    }
    if (op.op === OpKind.Content && op.id.kind === SeedKind.Content) {
      ordinal = Math.max(ordinal, op.id.ordinal + 1);
    }
  };
  for (const program of module.programs) {
    if (program.body.kind === ProgramBodyKind.Ops) {
      program.body.ops.forEach(scan);
    }
  }
  module.lifetimes = [...module.lifetimes];
  const convert = (op: LinkedOp): LinkedOp => {
    if (op.op === OpKind.Element) {
      return { ...op, children: op.children.map(convert) };
    }
    if (op.op !== OpKind.Hole || op.shape === Shape.Text) {
      return op;
    }
    let render: QrlUse;
    const value = op.value;
    if (value.v === ValueKind.Computed && value.resume.r === ResumeKind.Qrl) {
      render = value.resume.qrl;
      const index = module.qrls.findIndex((qrl) => qrl.id === render.qrl);
      module.qrls[index] = {
        ...module.qrls[index],
        payloadKind: QrlPayloadKind.Function,
        boundary: { kind: BoundaryKind.Implicit, role: 'content' },
      };
    } else if (
      (value.v === ValueKind.Read &&
        value.expr.kind === ExprKind.Ir &&
        value.expr.ir.kind === ValueIrKind.SignalRead) ||
      (value.v === ValueKind.Computed && op.contentCaptures !== undefined)
    ) {
      const binding =
        value.v === ValueKind.Read &&
        value.expr.kind === ExprKind.Ir &&
        value.expr.ir.kind === ValueIrKind.SignalRead
          ? value.expr.ir.binding
          : null;
      const captures = op.contentCaptures?.captures ?? [
        { binding: binding!, access: CaptureAccess.Direct },
      ];
      const args = op.contentCaptures?.args ?? [{ pass: ArgPass.Binding, binding: binding! }];
      const range =
        value.range ??
        (value.expr.kind === ExprKind.Js
          ? module.payloads[value.expr.payload].range
          : module.bindings[binding!].declarationRange!);
      const id = `linked_content_${ordinal}`;
      const name = createSegmentSymbolName(
        module.source.symbolNamespace ?? createSegmentSourceIdentity(module.path),
        id,
        'synthetic'
      );
      const qrl: LinkedQrl = {
        id,
        name,
        parent: null,
        ctxName: 'content',
        boundary: { kind: BoundaryKind.Implicit, role: 'content' },
        markerAttributes: [],
        payloadKind: QrlPayloadKind.Function,
        authoredAsync: false,
        body: { b: QrlBodyKind.Expr, expr: value.expr, initialOnly: false },
        captures,
        params: { authored: 0, used: [], sources: [] },
        origin: {
          range,
          functionRange: range,
          calleeRange: null,
          argumentRanges: [],
          paramRanges: [],
          bodyRange: range,
          bodyKind: FnBodyKind.Expression,
        },
        propsParts: [],
        dependencies: { bindings: captures.map((capture) => capture.binding), qrls: [] },
        delivery: { d: DeliveryKind.Chunk, chunkBase: `${module.path}_${name}`, resolved: true },
      };
      module.qrls.push(qrl);
      render = { qrl: id, args };
    } else {
      throw new Error(`Cannot link dynamic content in ${module.path}: ${value.v}`);
    }
    const lifetime = module.lifetimes.length;
    module.lifetimes.push({
      id: lifetime,
      parent: 0,
      owner: LifetimeOwner.DynamicValue,
      commit: LifetimeCommit.AtomicRange,
    });
    return {
      op: OpKind.Content,
      render,
      lifetime,
      shape: op.shape,
      id: { kind: SeedKind.Content, ordinal: ordinal++ },
    };
  };
  module.programs = module.programs.map((program) =>
    program.body.kind === ProgramBodyKind.Ops
      ? { ...program, body: { kind: ProgramBodyKind.Ops, ops: program.body.ops.map(convert) } }
      : program
  );
  module.qrls = module.qrls.map((qrl) => ({
    ...qrl,
    dependencies: collectQrlDependencies(module, qrl),
  }));
}
