/* eslint-disable no-console */
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { Rule, Scope } from 'eslint';
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
    // store for all qHooks visible inside qComponent only (qHooks declared outside qComponent are not stored)
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

    function isCallExpressionName(node: Rule.Node, name: string) {
      const callee = (node as ESTree.CallExpression).callee;
      return (
        // example: import {qHook} from '@builder.io/qwik'; qHook();
        (callee as ESTree.Identifier)?.name === name ||
        // example: import * as qwik from '@builder.io/qwik'; qwik.qHook(); qwik['qHook']();
        ((callee as ESTree.MemberExpression)?.property as ESTree.Identifier)?.name === name
      );
    }

    function isQHook(node: Rule.Node) {
      return isCallExpressionName(node, qHookName);
    }

    function isQComponent(node: Rule.Node) {
      return isCallExpressionName(node, qComponentName);
    }

    function getNodeId(node: ESTree.Identifier | Rule.Node) {
      return node.range?.[0] ?? -1;
    }

    function flattenScopeVariables(node: ESTree.Expression | ESTree.SpreadElement) {
      const scope = manager.acquire(node);
      return new Set(scope!.variables.map((v) => v.name));
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

    /**
     * Get resolved variables - no outer scope defined variables
     * - https://eslint.org/docs/developer-guide/scope-manager-interface#resolved
     */
    function traverseScopesVariables(
      queue: (Scope.Scope | null)[],
      cb: (v: Scope.Reference[]) => void
    ) {
      let scope = null;
      while ((scope = queue.pop())) {
        queue.push(...scope.childScopes);
        cb(scope.references.filter((i) => i.resolved));
      }
    }

    /**
     * Find closed over variables inside qHook scopes and report an error
     */
    function findClosedOverVariables(
      node:
        | (ESTree.FunctionExpression & Rule.NodeParentExtension)
        | (ESTree.ArrowFunctionExpression & Rule.NodeParentExtension)
    ) {
      // is node qHook and is qHook inside qComponent?
      const currentQHookScope = qHookStore.get(getNodeId(node.parent));
      // is qHook inside parent qHook?
      if (currentQHookScope && currentQHookScope.parentNode) {
        const parentQHookScope = qHookStore.get(getNodeId(currentQHookScope.parentNode))!;
        const queue = [manager.acquire(node)];
        traverseScopesVariables(queue, (variables) => {
          for (const variable of variables) {
            const { name } = variable.resolved!;
            if (parentQHookScope.variables.has(name) && !currentQHookScope.variables.has(name)) {
              report(variable.identifier, name);
            }
          }
        });
      }
    }

    return {
      CallExpression(node) {
        if (isQHook(node)) {
          if (isInsideQComponent(node)) {
            // the first argument is either ArrowFunctionExpression or FunctionExpression
            const fnExpression = node.arguments[0];
            if (fnExpression) {
              // flatten qHook references in order to easily access scoped variables & parentNode in reporting
              qHookStore.set(getNodeId(node), {
                variables: flattenScopeVariables(fnExpression),
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
