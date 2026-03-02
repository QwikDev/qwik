import { Rule } from 'eslint';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import * as eslint from 'eslint'; // For Scope types
const ISSERVER = 'isServer';
const GLOBALAPIS = ['process', '__dirname', '__filename', 'module'];
const PRESETNODEAPIS = ['fs', 'os', 'path', 'child_process', 'http', 'https', 'Buffer'];
// Helper function: checks if a node is a descendant of another node
function isNodeDescendantOf(descendantNode, ancestorNode): boolean {
  if (!ancestorNode) {
    return false;
  }
  let current: TSESTree.Node | undefined = descendantNode.parent;
  while (current) {
    if (current === ancestorNode) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export const scopeUseTask: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct or indirect (via one-level function call) Node.js API usage in useTask$ without a server guard (e.g., isServer).',
      category: 'Best Practices',
      recommended: true,
      url: '', // Optional: URL to your rule's documentation
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          forbiddenApis: {
            type: 'array',
            items: { type: 'string' },
            default: PRESETNODEAPIS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unsafeApiUsage:
        "Node.js API '{{apiName}}' should only be used inside an '{{guardName}}' block within useTask$. Example: if ({{guardName}}) { {{apiName}}.call(); }",
      unsafeApiUsageInCalledFunction:
        "Node.js API '{{apiName}}' used in function '{{calledFunctionName}}' (called from useTask$) needs '{{guardName}}' protection. Either guard the call site or protect the API usage within '{{calledFunctionName}}'.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const options = context.options[0] || {};
    const forbiddenApis = new Set<string>(
      options.forbiddenApis || PRESETNODEAPIS.concat(GLOBALAPIS)
    );
    const serverGuardIdentifier: string = ISSERVER;
    const sourceCode = context.sourceCode;

    let currentUseTaskFunction:
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | null = null;

    /**
     * Checks if the given AST node (API usage or call) is guarded by an `if
     * (serverGuardIdentifier)` block.
     *
     * @param apiOrCallNode - The AST node representing the API usage or function call.
     * @param functionContextNode - The function context node where the API or call resides.
     * @returns True if the node is properly guarded, false otherwise.
     */
    function isApiUsageGuarded(apiOrCallNode, functionContextNode): boolean {
      let currentParentNode: TSESTree.Node | undefined = apiOrCallNode.parent;
      while (
        currentParentNode &&
        currentParentNode !== functionContextNode.body &&
        currentParentNode !== functionContextNode
      ) {
        if (currentParentNode.type === AST_NODE_TYPES.IfStatement) {
          const ifStatement = currentParentNode;
          if (
            isNodeDescendantOf(apiOrCallNode, ifStatement.consequent) ||
            apiOrCallNode === ifStatement.consequent
          ) {
            const testExpression = ifStatement.test;
            if (
              testExpression.type === AST_NODE_TYPES.Identifier &&
              testExpression.name === serverGuardIdentifier
            ) {
              return true;
            }
            if (
              testExpression.type === AST_NODE_TYPES.BinaryExpression &&
              testExpression.operator === '==='
            ) {
              if (
                (testExpression.left.type === AST_NODE_TYPES.Identifier &&
                  testExpression.left.name === serverGuardIdentifier &&
                  testExpression.right.type === AST_NODE_TYPES.Literal &&
                  testExpression.right.value === true) ||
                (testExpression.right.type === AST_NODE_TYPES.Identifier &&
                  testExpression.right.name === serverGuardIdentifier &&
                  testExpression.left.type === AST_NODE_TYPES.Literal &&
                  testExpression.left.value === true)
              ) {
                return true;
              }
            }
            if (
              testExpression.type === AST_NODE_TYPES.UnaryExpression &&
              testExpression.operator === '!' &&
              testExpression.argument.type === AST_NODE_TYPES.UnaryExpression &&
              testExpression.argument.operator === '!' &&
              testExpression.argument.argument.type === AST_NODE_TYPES.Identifier &&
              testExpression.argument.argument.name === serverGuardIdentifier
            ) {
              return true;
            }
          }
        }
        currentParentNode = currentParentNode.parent;
      }
      return false;
    }

    /**
     * Checks if an identifier refers to a variable that has a user-defined declaration (Variable,
     * Parameter, FunctionName, ClassName, ImportBinding), effectively shadowing any global API of
     * the same name.
     *
     * @param identifierNode The identifier node to check.
     * @returns True if the identifier is shadowed by such a declaration, false otherwise (implying
     *   it might be a global API).
     */
    function isIdentifierShadowedByDeclaration(identifierNode): boolean {
      const scope = sourceCode.getScope(identifierNode);
      let variable: eslint.Scope.Variable | undefined | null = null;

      // Try to find the variable starting from the current scope and going upwards
      let currentScopeForSearch: eslint.Scope.Scope | null = scope;

      if (!GLOBALAPIS.includes(identifierNode.name)) {
        return true;
      }

      while (currentScopeForSearch) {
        const foundVar = currentScopeForSearch.variables.find(
          (v) => v.name === identifierNode.name
        );
        if (foundVar) {
          variable = foundVar;
          break;
        }
        if (currentScopeForSearch.type === 'global') {
          // If we reached global and didn't find it declared there.
          // Check if it's a known global implicitly (like 'process')
          variable = currentScopeForSearch.variables.find((v) => v.name === identifierNode.name);
          break;
        }
        currentScopeForSearch = currentScopeForSearch.upper;
      }

      // If we didn't find a variable, it might be a global API or an undeclared variable.

      if (!variable || variable.defs.length === 0) {
        // No definitions usually means it's an implicit global (e.g., 'process' in Node.js environment).
        // Such a variable is NOT considered "shadowed by a user declaration".
        return false;
      }

      // If there are definitions, check if any of them are standard declaration types.
      // This means the identifier refers to a user-declared variable, parameter, function, class, or an import.
      return variable.defs.some((def) => {
        return (
          def.type === 'Variable' ||
          def.type === 'Parameter' ||
          def.type === 'FunctionName' ||
          def.type === 'ClassName' ||
          def.type === 'ImportBinding'
        );
      });
    }

    /**
     * Traverses a function body or an expression to find unguarded API calls.
     *
     * @param nodeToAnalyze The function node or expression node to analyze.
     * @param functionContextForGuardCheck The original function context (e.g., foo) to check for
     *   guards.
     * @param callSiteNode The node where this function/expression was called/used from within
     *   useTask$ (for reporting).
     */
    function analyzeNodeContent(nodeToAnalyze, functionContextForGuardCheck, callSiteNode) {
      // Internal recursive visitor
      function internalVisitor(currentNode: TSESTree.Node): boolean {
        // Returns true if an error was reported
        if (!currentNode) {
          return false;
        }

        if (currentNode.type === AST_NODE_TYPES.Identifier) {
          if (forbiddenApis.has(currentNode.name)) {
            if (!isIdentifierShadowedByDeclaration(currentNode)) {
              if (!isApiUsageGuarded(currentNode, functionContextForGuardCheck)) {
                context.report({
                  node: callSiteNode as any,
                  messageId: 'unsafeApiUsageInCalledFunction',
                  data: {
                    apiName: currentNode.name,
                    calledFunctionName:
                      functionContextForGuardCheck.id?.name ||
                      (callSiteNode.type === AST_NODE_TYPES.Identifier
                        ? callSiteNode.name
                        : '[anonymous]'),
                    guardName: serverGuardIdentifier,
                  },
                });
                return true; // Error found
              }
            }
          }
        }

        // Traverse child nodes
        for (const key in currentNode) {
          if (key === 'parent' || key === 'range' || key === 'loc') {
            continue;
          }

          const child = (currentNode as any)[key];
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && 'type' in item) {
                if (internalVisitor(item as TSESTree.Node)) {
                  return true;
                }
              }
            }
          } else if (child && typeof child === 'object' && 'type' in child) {
            if (internalVisitor(child as TSESTree.Node)) {
              return true;
            }
          }
        }
        return false;
      }
      internalVisitor(nodeToAnalyze);
    }

    return {
      ':function'(
        node:
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression
          | TSESTree.FunctionDeclaration
      ) {
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.CallExpression &&
          parent.callee.type === AST_NODE_TYPES.Identifier &&
          parent.callee.name === 'useTask$' &&
          parent.arguments.length > 0 &&
          parent.arguments[0] === node
        ) {
          currentUseTaskFunction = node as
            | TSESTree.FunctionExpression
            | TSESTree.ArrowFunctionExpression;
        }
      },
      ':function:exit'(
        node:
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression
          | TSESTree.FunctionDeclaration
      ) {
        if (currentUseTaskFunction === node) {
          currentUseTaskFunction = null;
        }
      },

      Identifier(node) {
        if (!currentUseTaskFunction) {
          return;
        }
        // Ensure this identifier is directly within the useTask$ callback body.
        if (
          currentUseTaskFunction.body !== node &&
          !isNodeDescendantOf(node, currentUseTaskFunction.body)
        ) {
          return;
        }
        // Skip if it's a function name being called (handled by CallExpression)
        if (
          node.parent &&
          node.parent.type === AST_NODE_TYPES.CallExpression &&
          node.parent.callee === node
        ) {
          return;
        }

        if (forbiddenApis.has(node.name)) {
          if (isIdentifierShadowedByDeclaration(node)) {
            return;
          }
          if (!isApiUsageGuarded(node, currentUseTaskFunction)) {
            context.report({
              node,
              messageId: 'unsafeApiUsage',
              data: { apiName: node.name, guardName: serverGuardIdentifier },
            });
          }
        }
      },

      CallExpression(callNode) {
        if (!currentUseTaskFunction) {
          return;
        }
        if (!isNodeDescendantOf(callNode, currentUseTaskFunction.body)) {
          return;
        }
        if (isApiUsageGuarded(callNode, currentUseTaskFunction)) {
          return;
        }

        if (callNode.callee.type === AST_NODE_TYPES.Identifier) {
          const calleeIdentifierNode = callNode.callee;
          const scopeOfCallee = sourceCode.getScope(calleeIdentifierNode);
          let resolvedVariable: eslint.Scope.Variable | null = null;

          // Find the reference object for the calleeIdentifierNode
          const ref = scopeOfCallee.references.find((r) => r.identifier === calleeIdentifierNode);
          if (ref && ref.resolved) {
            resolvedVariable = ref.resolved;
          } else {
            // Fallback: If not found as a direct reference (e.g. declared in same scope or complex cases),
            // try to find variable by name walking up the scope chain.
            let currentScopeToSearch: eslint.Scope.Scope | null = scopeOfCallee;
            while (currentScopeToSearch) {
              const v = currentScopeToSearch.variables.find(
                (va) => va.name === calleeIdentifierNode.name
              );
              if (v && v.defs.length > 0) {
                // Ensure it has definitions
                resolvedVariable = v;
                break;
              }
              if (currentScopeToSearch.type === 'global' && !v) {
                // If global and still not found, break
                // Check globalScope explicitly for built-ins if not found as a declared variable
                const globalVar =
                  currentScopeToSearch.type === 'global'
                    ? currentScopeToSearch.variables.find(
                        (gv) => gv.name === calleeIdentifierNode.name
                      )
                    : null;
                if (globalVar) {
                  resolvedVariable = globalVar;
                }
                break;
              }
              if (!currentScopeToSearch.upper) {
                break;
              } // No more upper scopes
              currentScopeToSearch = currentScopeToSearch.upper;
            }
          }

          const variable = resolvedVariable;

          if (variable && variable.defs.length > 0) {
            const definition = variable.defs[0]; // Assuming the first definition is the relevant one
            let targetFunctionNode:
              | TSESTree.FunctionDeclaration
              | TSESTree.FunctionExpression
              | TSESTree.ArrowFunctionExpression
              | null = null;

            // Check if the definition's node is a FunctionDeclaration
            if (definition.node.type === AST_NODE_TYPES.FunctionDeclaration) {
              targetFunctionNode = definition.node;
            }
            // Check if the definition's node is a VariableDeclarator with a function init
            else if (
              definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
              definition.node.init &&
              (definition.node.init.type === AST_NODE_TYPES.FunctionExpression ||
                definition.node.init.type === AST_NODE_TYPES.ArrowFunctionExpression)
            ) {
              targetFunctionNode = definition.node.init;
            }

            if (targetFunctionNode) {
              const nodeToAnalyze =
                targetFunctionNode.body.type === AST_NODE_TYPES.BlockStatement
                  ? targetFunctionNode.body
                  : targetFunctionNode.body;
              analyzeNodeContent(nodeToAnalyze, targetFunctionNode, callNode);
            }
          }
        }
      },
    };
  },
};
