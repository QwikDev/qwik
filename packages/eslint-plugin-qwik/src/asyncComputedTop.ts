import { Rule } from 'eslint';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

function isFromQwikModule(resolvedVar: any): boolean {
  return resolvedVar?.defs?.some((def: any) => {
    if (def.type !== 'ImportBinding') {
      return false;
    }
    const importSource = def.parent.source.value;
    return (
      importSource.startsWith('@qwik.dev/core') ||
      importSource.startsWith('@qwik.dev/router') ||
      importSource.startsWith('@builder.io/qwik') ||
      importSource.startsWith('@builder.io/qwik-city')
    );
  });
}

function resolveVariableForIdentifier(context: Rule.RuleContext, ident: any) {
  const scope = context.sourceCode.getScope(ident);
  const ref = scope.references.find((r) => r.identifier === ident);
  if (ref && ref.resolved) {
    return ref.resolved;
  }
  // Fallback lookup walking up scopes by name
  let current: any = scope;
  while (current) {
    const found = current.variables.find((v: any) => v.name === ident.name);
    if (found) {
      return found;
    }
    current = current.upper;
  }
  return null;
}

function isQrlCallee(context: Rule.RuleContext, callee: TSESTree.Identifier): boolean {
  if (!callee || callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (!callee.name.endsWith('$')) {
    return false;
  }
  const resolved = resolveVariableForIdentifier(context, callee);
  return isFromQwikModule(resolved);
}

function getFirstStatementIfValueRead(
  body: TSESTree.BlockStatement
): TSESTree.ExpressionStatement | null {
  const first = body.body[0];
  if (!first || first.type !== AST_NODE_TYPES.ExpressionStatement) {
    return null;
  }
  const expr = first.expression;
  if (
    expr.type === AST_NODE_TYPES.MemberExpression &&
    !expr.computed &&
    expr.property.type === AST_NODE_TYPES.Identifier &&
    expr.property.name === 'value'
  ) {
    return first;
  }
  return null;
}

function isAsyncComputedIdentifier(context: Rule.RuleContext, ident: any): boolean {
  const variable = resolveVariableForIdentifier(context, ident);
  if (!variable || (variable.defs && variable.defs.length === 0)) {
    return false;
  }

  const services: any = (context as any).sourceCode.parserServices;
  const checker: ts.TypeChecker | undefined = services?.program?.getTypeChecker();
  const esTreeNodeToTSNodeMap = services?.esTreeNodeToTSNodeMap;

  function declIsAsyncComputedCall(decl: ts.Declaration | undefined): boolean {
    if (!decl) {
      return false;
    }
    if (
      ts.isVariableDeclaration(decl) &&
      decl.initializer &&
      ts.isCallExpression(decl.initializer)
    ) {
      const callee = decl.initializer.expression;
      if (ts.isIdentifier(callee)) {
        const name = callee.text;
        return name === 'createAsyncComputed$' || name === 'useAsyncComputed$';
      }
    }
    if (ts.isExportSpecifier(decl) || ts.isImportSpecifier(decl)) {
      // We'll rely on symbol resolution below; these alone don't tell us.
      return false;
    }
    return false;
  }

  for (const def of variable.defs) {
    if (def.type === 'Variable' && def.node.type === AST_NODE_TYPES.VariableDeclarator) {
      const init = def.node.init;
      if (init && init.type === AST_NODE_TYPES.CallExpression) {
        const callee = init.callee;
        if (callee.type === AST_NODE_TYPES.Identifier) {
          const name = callee.name;
          if (
            (name === 'useAsyncComputed$' || name === 'createAsyncComputed$') &&
            isFromQwikModule(resolveVariableForIdentifier(context, callee))
          ) {
            return true;
          }
        }
      }
    }
    if (def.type === 'ImportBinding' && checker && esTreeNodeToTSNodeMap) {
      try {
        // Map the identifier to TS node & promise symbol (following re-exports)
        const tsNode = esTreeNodeToTSNodeMap.get(ident as any);
        if (tsNode) {
          let symbol = checker.getSymbolAtLocation(tsNode);
          if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
            symbol = checker.getAliasedSymbol(symbol);
          }
          if (symbol) {
            for (const d of symbol.declarations ?? []) {
              if (declIsAsyncComputedCall(d)) {
                return true;
              }
              // Variable statement with multiple declarations
              if (ts.isVariableStatement(d)) {
                for (const decl of d.declarationList.declarations) {
                  if (declIsAsyncComputedCall(decl)) {
                    return true;
                  }
                }
              }
            }
            // As an extra heuristic, use the inferred return type of the symbol if it's a const
            const type = checker.getTypeOfSymbolAtLocation(symbol, tsNode);
            const typeStr = checker.typeToString(type.getNonNullableType());
            if (/AsyncComputed/i.test(typeStr)) {
              return true;
            }
          }
        }
      } catch {
        // ignore resolution errors
      }
    }
  }

  // As a fallback, try using TypeScript type information if available
  if (checker && esTreeNodeToTSNodeMap) {
    try {
      const tsNode = esTreeNodeToTSNodeMap.get(ident as any);
      const type = checker.getTypeAtLocation(tsNode);
      const typeStr = checker.typeToString(type.getNonNullableType());
      // Heuristic: type name includes AsyncComputed
      if (/AsyncComputed/i.test(typeStr)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

function hasAwaitResolveBefore(
  body: TSESTree.BlockStatement,
  beforeStmt: TSESTree.Statement,
  identifierName: string
): boolean {
  for (const stmt of body.body) {
    if (stmt === beforeStmt) {
      break;
    }
    if (stmt.type !== AST_NODE_TYPES.ExpressionStatement) {
      continue;
    }
    const expr = stmt.expression;
    if (expr.type !== AST_NODE_TYPES.AwaitExpression) {
      continue;
    }
    const awaited = expr.argument;
    if (
      awaited &&
      awaited.type === AST_NODE_TYPES.CallExpression &&
      awaited.callee.type === AST_NODE_TYPES.MemberExpression &&
      !awaited.callee.computed &&
      awaited.callee.object.type === AST_NODE_TYPES.Identifier &&
      awaited.callee.object.name === identifierName &&
      awaited.callee.property.type === AST_NODE_TYPES.Identifier &&
      awaited.callee.property.name === 'promise'
    ) {
      return true;
    }
  }
  return false;
}

export const asyncComputedTop: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Warn when an async computed signal '.value' is read not at the top of a QRL callback.",
      recommended: false,
      url: '',
    },
    schema: [],
    messages: {
      asyncComputedNotTop:
        "Async computed '{{name}}.value' must be first, or use 'await {{name}}.promise()' beforehand.",
    },
  },
  create(context) {
    const qrlFnStack: Array<
      TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration
    > = [];

    function isInTrackedQrl(
      fn:
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionDeclaration
    ): boolean {
      const parent = fn.parent;
      if (!parent || parent.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      if (parent.callee.type !== AST_NODE_TYPES.Identifier) {
        return false;
      }
      if (!isQrlCallee(context, parent.callee)) {
        return false;
      }
      // Function must be passed as a direct argument
      return parent.arguments.includes(fn as any);
    }

    return {
      ':function'(node: any) {
        if (
          (node.type === AST_NODE_TYPES.FunctionExpression ||
            node.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
          isInTrackedQrl(node)
        ) {
          qrlFnStack.push(node);
        }
      },
      ':function:exit'(node: any) {
        if (qrlFnStack.length && qrlFnStack[qrlFnStack.length - 1] === node) {
          qrlFnStack.pop();
        }
      },

      MemberExpression(node) {
        if (!qrlFnStack.length) {
          return;
        }
        const currentFn = qrlFnStack[qrlFnStack.length - 1]!;
        // Only care about reads like `foo.value;` that are expression statements
        if (
          node.parent?.type !== AST_NODE_TYPES.ExpressionStatement ||
          node.computed ||
          node.property.type !== AST_NODE_TYPES.Identifier ||
          node.property.name !== 'value'
        ) {
          return;
        }
        const exprStmt = node.parent as TSESTree.ExpressionStatement;
        // Find the top-of-body allowed zone
        const body =
          currentFn.body && currentFn.body.type === AST_NODE_TYPES.BlockStatement
            ? currentFn.body
            : null;
        if (!body) {
          return;
        }
        // Only consider top-level statements of the QRL callback body
        if (exprStmt.parent !== body) {
          return;
        }

        const allowedFirst = getFirstStatementIfValueRead(body);
        const isAtTop = allowedFirst === exprStmt;
        if (isAtTop) {
          return;
        }

        // Determine if the object is an async computed signal
        const obj = node.object;
        if (obj.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        if (!isAsyncComputedIdentifier(context, obj)) {
          return;
        }

        // Allow if there is an earlier 'await <ident>.resolve()' in the same body
        if (hasAwaitResolveBefore(body, exprStmt, obj.name)) {
          return;
        }

        context.report({
          node: node as any,
          messageId: 'asyncComputedNotTop',
          data: { name: obj.name },
        });
      },
    } as Rule.RuleListener;
  },
};
