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

        function flattenFnNodeParams(node) {
          const paramSet = new Set();
          for (let param of node.params) {
            if (param.type === 'ObjectPattern') {
              for (let paramOP of param.properties) {
                paramSet.add(paramOP.value.name);
              }
            } else if (param.type === 'Identifier') {
              paramSet.add(param.name);
            }
          }
          return paramSet;
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
                      parentRecord.params.has(variable.name) &&
                      !record.params.has(variable.name)
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
                  // flatten qHook references in order to easily access params & parentNode in reporting
                  qHookStore.set(getNodeId(node), {
                    params: flattenFnNodeParams(fnNode),
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
