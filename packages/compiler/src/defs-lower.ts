import { getRange, unwrapExpression } from './ast-utils';
import { lowerValueIr, type ExprLowerFacts } from './expr-lower';
import { ValueIrKind, type ValueIR } from './expr-ir';
import type { BindingId, ModuleAnalysis } from './plan-types';
import type { Program } from 'oxc-parser';

/**
 * `defs` — auto-lowered user helpers (specs/02 §defs). Module-scope functions whose bodies are
 * single-expression IR-lowerable, collected in declaration order and invoked via `def-call`.
 * Constraints kept here: simple identifier params, bodies reading only params and earlier defs
 * (acyclic by construction), no state writes (expressions cannot write). Anything else stays a
 * fallback — never a partial def.
 */
export interface ModuleDef {
  readonly binding: BindingId;
  readonly name: string;
  readonly params: readonly BindingId[];
  readonly body: ValueIR;
}

export function collectModuleDefs(
  program: Program,
  analysis: ModuleAnalysis,
  baseFacts: ExprLowerFacts
): ModuleDef[] {
  const defs: ModuleDef[] = [];
  const defIndexByBinding = new Map<BindingId, number>();
  const facts: ExprLowerFacts = {
    ...baseFacts,
    defIndex: (binding) => defIndexByBinding.get(binding) ?? null,
  };

  const tryCollect = (nameNode: unknown, params: unknown[], bodyNode: unknown): void => {
    const nameRange = getRange(unwrapExpression(nameNode));
    const binding =
      nameRange === null
        ? null
        : (analysis.bindings.find(
            (candidate) =>
              candidate.declarationRange !== null &&
              candidate.declarationRange[0] === nameRange[0] &&
              candidate.declarationRange[1] === nameRange[1]
          ) ?? null);
    if (binding === null || binding.kind !== 'module') {
      return;
    }
    const paramBindings: BindingId[] = [];
    for (const param of params) {
      const parameter = unwrapExpression(param);
      if (parameter?.type !== 'Identifier') {
        return; // destructured/default params stay fallback
      }
      const paramBinding = baseFacts.bindingIdAt(getRange(parameter));
      if (paramBinding === null) {
        return;
      }
      paramBindings.push(paramBinding);
    }
    const body = lowerValueIr(bodyNode, facts);
    if (body === null || !readsOnly(body, new Set(paramBindings))) {
      return;
    }
    defIndexByBinding.set(binding.id, defs.length);
    defs.push({ binding: binding.id, name: binding.name, params: paramBindings, body });
  };

  for (const statement of program.body as unknown as AstStatement[]) {
    if (statement.type === 'FunctionDeclaration' && statement.id != null) {
      const returned = singleReturnExpression(statement.body);
      if (returned !== null && statement.async !== true && statement.generator !== true) {
        tryCollect(statement.id, statement.params ?? [], returned);
      }
      continue;
    }
    if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
      for (const declarator of statement.declarations ?? []) {
        const init = unwrapExpression((declarator as { init?: unknown }).init);
        if (
          init?.type === 'ArrowFunctionExpression' &&
          (init as { async?: boolean }).async !== true
        ) {
          const arrow = init as { params?: unknown[]; body?: unknown; expression?: boolean };
          const bodyExpression =
            arrow.expression === true ? arrow.body : singleReturnExpression(arrow.body);
          if (bodyExpression != null) {
            tryCollect((declarator as { id?: unknown }).id, arrow.params ?? [], bodyExpression);
          }
        }
      }
    }
  }
  return defs;
}

interface AstStatement {
  type: string;
  id?: unknown;
  params?: unknown[];
  body?: unknown;
  async?: boolean;
  generator?: boolean;
  kind?: string;
  declarations?: unknown[];
}

/** `{ return expr; }` — the only block shape defs accept. */
function singleReturnExpression(body: unknown): unknown {
  const block = body as { type?: string; body?: unknown[] } | null | undefined;
  if (block?.type !== 'BlockStatement' || block.body?.length !== 1) {
    return null;
  }
  const statement = block.body[0] as { type?: string; argument?: unknown };
  return statement.type === 'ReturnStatement' && statement.argument != null
    ? statement.argument
    : null;
}

/** Every binding-read must be a param; def-calls are index-resolved and safe by construction. */
function readsOnly(ir: ValueIR, params: ReadonlySet<BindingId>): boolean {
  let clean = true;
  const walk = (node: ValueIR): void => {
    if (!clean) {
      return;
    }
    switch (node.kind) {
      case ValueIrKind.BindingRead:
      case ValueIrKind.SignalRead:
        if (!params.has(node.binding)) {
          clean = false;
        }
        return;
      case ValueIrKind.Member:
      case ValueIrKind.Index:
        walk(node.obj);
        if (node.kind === ValueIrKind.Index) {
          walk(node.key);
        }
        return;
      case ValueIrKind.Unary:
        walk(node.operand);
        return;
      case ValueIrKind.Bin:
      case ValueIrKind.Logic:
        walk(node.left);
        walk(node.right);
        return;
      case ValueIrKind.Cond:
        walk(node.test);
        walk(node.then);
        walk(node.else);
        return;
      case ValueIrKind.Template:
        for (const part of node.parts) {
          if (typeof part !== 'string') {
            walk(part);
          }
        }
        return;
      case ValueIrKind.Array:
        node.items.forEach(walk);
        return;
      case ValueIrKind.Object:
        node.entries.forEach(([, value]) => walk(value));
        return;
      case ValueIrKind.Call:
        if (node.receiver !== null) {
          walk(node.receiver);
        }
        for (const argument of node.args) {
          // lambdas carry the 'lambda' discriminant; everything else is ValueIR
          if ((argument as { kind?: string }).kind !== 'lambda') {
            walk(argument as ValueIR);
          }
        }
        return;
      case ValueIrKind.DefCall:
        node.args.forEach(walk);
        return;
      default:
        return;
    }
  };
  walk(ir);
  return clean;
}
