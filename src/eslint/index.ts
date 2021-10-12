/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Rule } from 'eslint';
import type * as ESTree from 'estree';

const noClosedOverVariables: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Anything inside the `qHook` can't close over variables",
      category: 'Variables',
      recommended: false,
      url: 'https://github.com/BuilderIO/qwik',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    const manager = sourceCode.scopeManager;
    const qHookName = 'qHook';
    const qComponentName = 'qComponent';
    // linked list for all qHooks visible inside qComponent only (qHooks declared outside qComponent are not stored)
    const qHookStore = new Map<
      number,
      {
        variables: Set<string>;
        parentNode: ESTree.Identifier | null;
      }
    >();

    function report(node: ESTree.Identifier, name: string) {
      context.report({
        node,
        message: `${name} is closed over.`,
      });
    }

    function isQHook(node: Rule.Node) {
      return ((node as ESTree.CallExpression).callee as ESTree.Identifier)?.name === qHookName;
    }

    function isQComponent(node: Rule.Node) {
      return ((node as ESTree.CallExpression).callee as ESTree.Identifier)?.name === qComponentName;
    }

    function walkToFirstQHook(node: Rule.Node): ESTree.Identifier | null {
      while (node) {
        if (isQHook(node)) {
          return (node as ESTree.CallExpression).callee as ESTree.Identifier;
        }
        node = node.parent;
      }
      return null;
    }

    function isInsideQComponent(node: Rule.Node): ESTree.Identifier | null {
      while (node) {
        if (isQComponent(node)) {
          return (node as ESTree.CallExpression).callee as ESTree.Identifier;
        }
        node = node.parent;
      }
      return null;
    }

    function getNodeId(node: ESTree.Identifier | Rule.Node) {
      return node.range && node.range[0] !== undefined ? node.range[0] : -1;
    }

    function flattenScopeVariables(node: ESTree.Expression | ESTree.SpreadElement) {
      const scope = manager.acquire(node);
      return new Set(scope!.variables.map((v) => v.name));
    }

    function findClosedOverVariables(
      node:
        | (ESTree.FunctionExpression & Rule.NodeParentExtension)
        | (ESTree.ArrowFunctionExpression & Rule.NodeParentExtension)
    ) {
      if (isQHook(node.parent)) {
        // is qHook inside qComponent?
        const scopeRecord = qHookStore.get(getNodeId(node.parent));
        // is qHook inside parent one?
        if (scopeRecord && scopeRecord.parentNode) {
          const parentScopeRecord = qHookStore.get(getNodeId(scopeRecord.parentNode));
          // get node Scope (FunctionScope in this case) in order to get all scoped variables
          const queue = [manager.acquire(node)];
          let scope = null;
          // get all FunctionScope variable references and find whether it wasn't declared in parent FunctionScope which is forbidden
          while ((scope = queue.pop())) {
            queue.push(...scope.childScopes);
            for (const ref of scope.references) {
              const scopeVariableRef = ref.resolved;
              if (scopeVariableRef) {
                // variable declared in parent FunctionScope, error is fired
                if (
                  parentScopeRecord!.variables.has(scopeVariableRef.name) &&
                  !scopeRecord.variables.has(scopeVariableRef.name)
                ) {
                  report(ref.identifier, scopeVariableRef.name);
                }
              }
            }
          }
        }
      }
    }

    return {
      CallExpression(node) {
        if (isQHook(node)) {
          const qComponent = isInsideQComponent(node);
          if (qComponent) {
            const fnNode = node.arguments[0];
            if (fnNode) {
              // flatten qHook references in order to easily access scoped variables & parentNode in reporting
              qHookStore.set(getNodeId(node), {
                variables: flattenScopeVariables(fnNode),
                parentNode: walkToFirstQHook(node.parent),
              });
            }
          }
        }
      },
      ArrowFunctionExpression: findClosedOverVariables,
      FunctionExpression: findClosedOverVariables,
    };
  },
};

export const rules = {
  'no-closed-over-variables': noClosedOverVariables,
};
