import {
  ArgKind,
  BindTargetKind,
  CallTargetKind,
  ComponentPropsKind,
  ComponentTargetKind,
  ExprKind,
  HandlerKind,
  OpKind,
  ProgramBodyKind,
  ProjectionKind,
  PropKind,
  PropsPartKind,
  QrlBodyKind,
  ResumeKind,
  RowKind,
  SetupKind,
  ValueKind,
  type Arg,
  type BindTarget,
  type Expr,
  type ExpressionIR,
  type LinkedQrl,
  type LinkedModule,
  type LinkedOp,
  type LocalId,
  type ModulePlan,
  type Op,
  type Prop,
  type Qrl,
  type QrlId,
  type QrlUse,
  type Setup,
  type Value,
} from '../schema';
import { ValueIrKind, collectIrBindingIds, type ValueIR } from '../../src/expr-ir';

/** Dependencies follow executable edges, never enclosing authored source ranges. */
export function collectQrlDependencies(
  module: ModulePlan | LinkedModule,
  qrl: Qrl
): LinkedQrl['dependencies'] {
  const bindings = new Set<LocalId>();
  const qrls = new Set<QrlId>();
  const programs = new Set<number>();
  const payloads = new Set<number>();

  function visitQrlUse(value: QrlUse | null) {
    if (value !== null) {
      qrls.add(value.qrl);
    }
  }

  function visitPayload(index: number) {
    if (payloads.has(index)) {
      return;
    }
    payloads.add(index);
    const source = module.payloads[index];
    for (const read of source.reads) {
      bindings.add(read.binding);
      if (read.value !== undefined) {
        visitExpressionIr(read.value);
      }
    }
    source.qrls.forEach((entry) => visitQrlUse(entry.use));
    source.renders.forEach((entry) => visitProgram(entry.program));
    source.setups?.forEach((entry) => entry.setup.forEach(visitSetup));
    source.temps.forEach((entry) => visitPayload(entry.init));
  }

  function visitExpressionIr(value: ExpressionIR) {
    if (value.kind === ExprKind.Js) {
      visitPayload(value.payload);
      return;
    }
    collectIrBindingIds(value as ValueIR, bindings);
    switch (value.kind) {
      case ValueIrKind.Cond:
        visitExpressionIr(value.test);
        visitExpressionIr(value.then);
        visitExpressionIr(value.else);
        break;
      case ValueIrKind.Member:
        visitExpressionIr(value.obj);
        break;
      case ValueIrKind.PropRead:
        visitExpressionIr(value.fallback);
        break;
    }
  }

  function visitExpression(value: Expr) {
    if (value.kind === ExprKind.Js) {
      visitPayload(value.payload);
    } else {
      visitExpressionIr(value.ir);
    }
  }

  function visitValue(entry: Value) {
    switch (entry.v) {
      case ValueKind.Read:
        visitExpression(entry.expr);
        break;
      case ValueKind.Computed:
        if (entry.resume.r === ResumeKind.Qrl) {
          visitQrlUse(entry.resume.qrl);
        } else {
          visitExpression(entry.expr);
        }
        break;
      case ValueKind.Qrl:
        visitQrlUse(entry.use);
        break;
      case ValueKind.Render:
        visitProgram(entry.program);
        break;
    }
  }

  function visitArgument(entry: Arg) {
    switch (entry.a) {
      case ArgKind.Expr:
      case ArgKind.Spread:
        visitExpression(entry.expr);
        break;
      case ArgKind.Value:
        visitValue(entry.value);
        break;
      case ArgKind.Qrl:
        visitQrlUse(entry.use);
        break;
    }
  }

  function visitPattern(target: BindTarget | null) {
    if (target?.bind === BindTargetKind.Pattern) {
      visitPayload(target.pattern);
    }
  }

  function visitSetup(entry: Setup) {
    switch (entry.s) {
      case SetupKind.Call:
        // A hook's twins come from its own source, so that edge stays a runtime dependency.
        if (
          entry.target.kind === CallTargetKind.Binding ||
          entry.target.kind === CallTargetKind.Marker
        ) {
          bindings.add(entry.target.binding);
        } else if (entry.target.kind === CallTargetKind.Value) {
          visitExpressionIr(entry.target.value);
        }
        entry.args.forEach(visitArgument);
        visitPattern(entry.result);
        break;
      case SetupKind.Const:
        if (entry.value !== undefined) {
          visitValue(entry.value);
        }
        if (entry.defaultValue !== undefined) {
          visitValue(entry.defaultValue);
        }
        visitPattern(entry.result);
        break;
      case SetupKind.PropDefault:
        visitExpression(entry.initializer);
        break;
      case SetupKind.Js:
        visitPayload(entry.payload);
        break;
      case SetupKind.RenderValue:
        visitProgram(entry.program);
        visitPattern(entry.result);
        break;
      case SetupKind.LocalComponent:
        visitProgram(entry.program);
        if (entry.parameter !== null) {
          visitPayload(entry.parameter.pattern);
        }
        break;
      case SetupKind.Style:
        if (typeof entry.css !== 'string') {
          visitPayload(entry.css.dynamic);
        }
        visitPattern(entry.result);
        break;
    }
  }

  function visitProp(entry: Prop) {
    switch (entry.k) {
      case PropKind.Dynamic:
      case PropKind.Spread:
      case PropKind.Ref:
      case PropKind.InnerHtml:
        visitValue(entry.value);
        break;
      case PropKind.Event:
        entry.handlers.forEach((handler) => {
          if (handler.h === HandlerKind.Value) {
            visitValue(handler.value);
          }
        });
        break;
    }
  }

  function visitOp(entry: Op | LinkedOp) {
    switch (entry.op) {
      case OpKind.Element:
        entry.props.forEach(visitProp);
        visitQrlUse(entry.propsEffect);
        entry.children.forEach(visitOp);
        break;
      case OpKind.Hole:
        visitValue(entry.value);
        break;
      case OpKind.Component:
        if (
          entry.target.t === ComponentTargetKind.Raw ||
          entry.target.t === ComponentTargetKind.Declaration
        ) {
          bindings.add(entry.target.binding);
        }
        if (entry.props.c === ComponentPropsKind.Entries) {
          entry.props.props.forEach(visitProp);
        } else {
          visitQrlUse(entry.props.compute);
        }
        entry.projections.forEach((projection) =>
          visitQrlUse(
            projection.kind === ProjectionKind.Render ? projection.use : projection.fallback
          )
        );
        break;
      case OpKind.Branch:
        visitValue(entry.condition);
        visitQrlUse(entry.then);
        visitQrlUse(entry.else);
        break;
      case OpKind.Each:
        visitValue(entry.source.value);
        if (entry.key !== null) {
          visitValue(entry.key);
        }
        if (entry.row.r === RowKind.Chunk) {
          visitQrlUse(entry.row.use);
        } else {
          visitProgram(entry.row.program);
        }
        break;
      case OpKind.Slot:
        visitQrlUse(entry.fallback);
        if (entry.nameValue !== undefined) {
          visitValue(entry.nameValue);
        }
        break;
      case OpKind.Content:
        visitQrlUse(entry.render);
        break;
      case OpKind.Suspense:
        visitProgram(entry.content);
        if (typeof entry.fallback === 'number') {
          visitProgram(entry.fallback);
        } else if (entry.fallback !== null) {
          visitValue(entry.fallback);
        }
        if (entry.delay !== null) {
          visitValue(entry.delay);
        }
        break;
    }
  }

  function visitProgram(index: number) {
    if (programs.has(index)) {
      return;
    }
    programs.add(index);
    const entry = module.programs[index];
    entry.setup.forEach(visitSetup);
    if (entry.body.kind === ProgramBodyKind.Ops) {
      entry.body.ops.forEach(visitOp);
    } else {
      visitExpression(entry.body.expr);
    }
  }

  switch (qrl.body.b) {
    case QrlBodyKind.Js:
      visitPayload(qrl.body.payload);
      break;
    case QrlBodyKind.Expr:
      visitExpression(qrl.body.expr);
      break;
    case QrlBodyKind.Program:
      visitProgram(qrl.body.program);
      break;
  }
  qrl.params.sources.forEach(visitPayload);
  if (qrl.declaration?.parameter != null) {
    visitPayload(qrl.declaration.parameter.pattern);
  }
  for (const part of qrl.propsParts) {
    if (part.kind === PropsPartKind.Event) {
      visitQrlUse(part.use);
    } else if (part.kind === PropsPartKind.Expression || part.kind === PropsPartKind.Spread) {
      visitPayload(part.value);
    }
  }
  return {
    bindings: [...bindings],
    qrls: [...qrls],
  };
}
