import type { Rule } from 'eslint';
import { ESLintUtils, TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import ts from 'typescript';
import {
  findContainingFunction,
  isFromQwikModule,
  isQwikQrlCallee,
  resolveVariableForIdentifier,
} from './utils';

function isQrlCallee(context: Rule.RuleContext, callee: TSESTree.Identifier): boolean {
  return isQwikQrlCallee(context, callee);
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

function isAsyncIdentifier(context: Rule.RuleContext, ident: TSESTree.Identifier): boolean {
  const variable = resolveVariableForIdentifier(context, ident);
  if (!variable || (variable.defs && variable.defs.length === 0)) {
    return false;
  }

  const services = ESLintUtils.getParserServices(
    context as unknown as TSESLint.RuleContext<string, readonly unknown[]>
  );
  const checker: ts.TypeChecker | undefined = services?.program?.getTypeChecker();
  const esTreeNodeToTSNodeMap = services?.esTreeNodeToTSNodeMap;

  function declIsAsyncCall(decl: ts.Declaration | undefined): boolean {
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
        return name === 'createAsync$' || name === 'useAsync$' || name === 'routeLoader$';
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
            (name === 'useAsync$' || name === 'createAsync$' || name === 'routeLoader$') &&
            isFromQwikModule(resolveVariableForIdentifier(context, callee))
          ) {
            return true;
          }

          // Check if callee was created by routeLoader$ (or other async computed creators)
          // e.g., const signal = useProductDetails() where useProductDetails = routeLoader$(...)
          const calleeResolved = resolveVariableForIdentifier(context, callee);
          if (calleeResolved && calleeResolved.defs) {
            for (const calleeDef of calleeResolved.defs) {
              if (
                calleeDef.type === 'Variable' &&
                calleeDef.node.type === AST_NODE_TYPES.VariableDeclarator
              ) {
                const calleeInit = calleeDef.node.init;
                if (calleeInit && calleeInit.type === AST_NODE_TYPES.CallExpression) {
                  const calleeCallee = calleeInit.callee;
                  if (calleeCallee.type === AST_NODE_TYPES.Identifier) {
                    const calleeName = calleeCallee.name;
                    if (
                      calleeName === 'routeLoader$' &&
                      isFromQwikModule(resolveVariableForIdentifier(context, calleeCallee))
                    ) {
                      return true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (def.type === 'ImportBinding' && checker && esTreeNodeToTSNodeMap) {
      try {
        // Map the identifier to TS node & promise symbol (following re-exports)
        const tsNode = esTreeNodeToTSNodeMap.get(ident);
        if (tsNode) {
          let symbol = checker.getSymbolAtLocation(tsNode);
          if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
            symbol = checker.getAliasedSymbol(symbol);
          }
          if (symbol) {
            for (const d of symbol.declarations ?? []) {
              if (declIsAsyncCall(d)) {
                return true;
              }
              // Variable statement with multiple declarations
              if (ts.isVariableStatement(d)) {
                for (const decl of d.declarationList.declarations) {
                  if (declIsAsyncCall(decl)) {
                    return true;
                  }
                }
              }
            }
            // As an extra heuristic, use the inferred return type of the symbol if it's a const
            const type = checker.getTypeOfSymbolAtLocation(symbol, tsNode);
            const typeStr = checker.typeToString(type.getNonNullableType());
            if (/Async/i.test(typeStr)) {
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
      const tsNode = esTreeNodeToTSNodeMap.get(ident);
      const type = checker.getTypeAtLocation(tsNode);
      const typeStr = checker.typeToString(type.getNonNullableType());
      // Heuristic: type name includes Async or LoaderSignal
      if (/Async|LoaderSignal/i.test(typeStr)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

function hasAwaitPromiseBefore(
  body: TSESTree.BlockStatement,
  beforeStmt: TSESTree.ExpressionStatement | TSESTree.ReturnStatement,
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
    let awaited = expr.argument;

    // Handle `await signal.promise()`
    if (awaited.type === AST_NODE_TYPES.CallExpression) {
      awaited = awaited.callee;
    }

    // Handle `await signal.promise`
    if (
      awaited.type === AST_NODE_TYPES.MemberExpression &&
      !awaited.computed &&
      awaited.object.type === AST_NODE_TYPES.Identifier &&
      awaited.object.name === identifierName &&
      awaited.property.type === AST_NODE_TYPES.Identifier &&
      awaited.property.name === 'promise'
    ) {
      return true;
    }
  }
  return false;
}

function shouldCheckFunction(
  context: Rule.RuleContext,
  fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
  signalIdent: TSESTree.Identifier
): boolean {
  // Check if this function is directly passed to a QRL (e.g., component$, $, etc.)
  const parent = fn.parent;
  if (parent && parent.type === AST_NODE_TYPES.CallExpression) {
    if (parent.callee.type === AST_NODE_TYPES.Identifier) {
      if (isQrlCallee(context, parent.callee)) {
        // Check if the function is in the arguments
        for (const arg of parent.arguments) {
          if (arg === fn) {
            return true;
          }
        }
      }
    }
  }

  // For non-QRL functions, only check if:
  // 1. It's an async function
  // 2. The signal is a parameter (not captured from outer scope)
  if (fn.async) {
    // Check if the signal identifier is a parameter of this function
    for (const param of fn.params) {
      if (param.type === AST_NODE_TYPES.Identifier && param.name === signalIdent.name) {
        return true;
      }
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
    return {
      MemberExpression(node) {
        if (
          node.computed ||
          node.property.type !== AST_NODE_TYPES.Identifier ||
          node.property.name !== 'value'
        ) {
          return;
        }

        const obj = node.object;
        if (obj.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        if (!isAsyncIdentifier(context, obj)) {
          return;
        }

        const currentFn = findContainingFunction(node);
        if (!currentFn) {
          return;
        }

        // Only check functions that are QRL callbacks or async functions with signal parameters
        if (!shouldCheckFunction(context, currentFn, obj)) {
          return;
        }

        // Only care about reads like `foo.value;` that are expression statements
        // or returns
        const parentStmt = node.parent;
        if (
          !parentStmt ||
          (parentStmt.type !== AST_NODE_TYPES.ExpressionStatement &&
            parentStmt.type !== AST_NODE_TYPES.ReturnStatement)
        ) {
          return;
        }

        // Find the top-of-body allowed zone
        const body =
          currentFn.body && currentFn.body.type === AST_NODE_TYPES.BlockStatement
            ? currentFn.body
            : null;
        if (!body) {
          // Arrow function with implicit return, e.g. () => mySignal.value
          if (currentFn.body.type === AST_NODE_TYPES.MemberExpression && currentFn.body === node) {
            // This is ok, it's at the "top"
            return;
          }
          return;
        }
        // Only consider top-level statements of the function body
        if (parentStmt.parent !== body) {
          return;
        }

        // Check if this .value access is at the top of the function body
        // The first statement is allowed (this is the "top")
        const firstStmt = body.body[0];
        if (firstStmt === parentStmt) {
          return; // This is the first statement, OK
        }

        // Also allow if the first statement is a .value access (even if current is not first)
        // This handles the case where the first .value primes the signal
        const allowedFirst = getFirstStatementIfValueRead(body);
        if (allowedFirst === parentStmt) {
          return; // This is the designated first .value access, OK
        }

        // Allow if there is an earlier 'await <ident>.promise' in the same body.
        if (
          (parentStmt.type === AST_NODE_TYPES.ExpressionStatement ||
            parentStmt.type === AST_NODE_TYPES.ReturnStatement) &&
          hasAwaitPromiseBefore(body, parentStmt, obj.name)
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'asyncComputedNotTop',
          data: { name: obj.name },
        });
      },
    } as Rule.RuleListener;
  },
};
