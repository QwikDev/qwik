import { Rule } from 'eslint';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import ts from 'typescript';

// Utility type to handle nodes from Rule handlers which may come from @types/estree
// The nodes from Rule handlers are compatible with TSESTree at runtime but not at the type level
// because @types/estree uses string literals while TSESTree uses AST_NODE_TYPES enum
type RuleNode<T extends TSESTree.Node = TSESTree.Node> = {
  type: any;
  parent?: any;
  [key: string]: any;
};

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
        return (
          name === 'createAsyncComputed$' || name === 'useAsyncComputed$' || name === 'routeLoader$'
        );
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
            (name === 'useAsyncComputed$' ||
              name === 'createAsyncComputed$' ||
              name === 'routeLoader$') &&
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
      // Heuristic: type name includes AsyncComputed or LoaderSignal
      if (/AsyncComputed|LoaderSignal/i.test(typeStr)) {
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
  beforeStmt: RuleNode<TSESTree.ExpressionStatement> | RuleNode<TSESTree.ReturnStatement>,
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

function findContainingFunction(
  node: RuleNode
):
  | RuleNode<TSESTree.FunctionDeclaration>
  | RuleNode<TSESTree.FunctionExpression>
  | RuleNode<TSESTree.ArrowFunctionExpression>
  | null {
  let current: any = node;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function shouldCheckFunction(
  context: Rule.RuleContext,
  fn:
    | RuleNode<TSESTree.FunctionDeclaration>
    | RuleNode<TSESTree.FunctionExpression>
    | RuleNode<TSESTree.ArrowFunctionExpression>,
  signalIdent: RuleNode<TSESTree.Identifier>
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

        if (!isAsyncComputedIdentifier(context, obj)) {
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
