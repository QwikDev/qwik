module.exports = {
  rules: {
    'no-closed-over-variables': {
      create: function (context) {
        const sourceCode = context.getSourceCode();
        const manager = sourceCode.scopeManager;
        const qHookName = 'qHook';
        const qComponentName = 'qComponent';
        const qHookStore = new Map();

        function report(node, name) {
          context.report({
            node,
            message: `${name} is closed over.`,
          });
        }

        function isQHook(node) {
          return node.callee && node.callee.name === qHookName;
        }

        function isQComponent(node) {
          return node.callee && node.callee.name === qComponentName;
        }

        function walkToFirstQHook(node) {
          while (node) {
            if (isQHook(node)) {
              return node.callee;
            }
            node = node.parent;
          }
          return null;
        }

        function isInsideQComponent(node) {
          while (node) {
            if (isQComponent(node)) {
              return node.callee;
            }
            node = node.parent;
          }
          return null;
        }

        function getNodeId(node) {
          return node.range && node.range[0] !== undefined ? node.range[0] : null;
        }

        function flattenScopeVariables(node) {
          const scope = manager.acquire(node)
          return new Set(scope.variables.map(v => v.name));
        }

        function findClosedOverVariables(node) {
          // is qHook?
          const functionScope = manager.acquire(node);
          const qHookNode = functionScope.block.parent.callee;
          if (qHookNode && qHookNode.name === qHookName) {
            // is qHook inside qComponent?
            const record = qHookStore.get(getNodeId(qHookNode));
            // is qHook inside parent one?
            if (record && record.parentNode) {
              const parentRecord = qHookStore.get(getNodeId(record.parentNode));
              // iterate over all scopes(children included) - FunctionScope, BlockScope etc...
              const queue = [functionScope];
              let scope = null;
              while ((scope = queue.pop())) {
                queue.push(...scope.childScopes);
                for (const ref of scope.references) {
                  const variable = ref.resolved;
                  if (variable) {
                    // is variable declared in parentRecord, if so fire an error
                    if (
                      parentRecord.variables.has(variable.name) &&
                      !record.variables.has(variable.name)
                    ) {
                      report(ref.identifier, variable.name);
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
    },
  },
};
