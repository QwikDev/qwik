// This was vibe-coded with AI
import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import { QwikEslintExamples } from '../examples';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://qwik.dev/docs/advanced/eslint/#${name}`
);

export const serializerSignalUsage = createRule({
  name: 'serializer-signal-usage',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure signals used in update() are also used in deserialize()',
    },
    schema: [],
    messages: {
      serializerSignalMismatch:
        'Signals/Stores used in update() must also be used in deserialize(). Missing: {{signals}}',
    },
  },
  defaultOptions: [],
  create(context) {
    // Helper: check if an identifier looks like a signal/store by name
    function isSignalOrStoreName(name: string): boolean {
      return (
        name.endsWith('Signal') || name.endsWith('Store') || name === 'signal' || name === 'store'
      );
    }

    // Helper: collect signals/stores used in a function body
    function collectSignalsFromFunction(
      node: TSESTree.BlockStatement | TSESTree.Expression
    ): Set<string> {
      const signals = new Set<string>();
      const visited = new WeakSet<object>();
      const functionParams = new Set<string>();

      // Collect function parameters if available
      if ('params' in node && Array.isArray(node.params)) {
        node.params.forEach((param) => {
          if (param.type === 'Identifier') {
            functionParams.add(param.name);
          }
        });
      }

      function isAssignmentTarget(node: TSESTree.Node): boolean {
        const parent = (node as any).parent;
        if (!parent) {
          return false;
        }
        if (parent.type === 'AssignmentExpression' && parent.left === node) {
          return true;
        }
        if (parent.type === 'UpdateExpression' && parent.argument === node) {
          return true;
        }
        return false;
      }

      function visit(n: any) {
        if (!n || typeof n !== 'object' || visited.has(n)) {
          return;
        }
        visited.add(n);

        // MemberExpression: obj.value or obj.prop
        if (n.type === 'MemberExpression' && !isAssignmentTarget(n)) {
          // Only support simple identifiers for now
          if (n.object.type === 'Identifier' && !functionParams.has(n.object.name)) {
            // Heuristic: treat as signal if .value, or as store if .prop
            if (n.property.type === 'Identifier' && n.property.name === 'value') {
              signals.add(n.object.name);
            } else if (n.property.type === 'Identifier') {
              // If the object name looks like a store, track property
              if (isSignalOrStoreName(n.object.name)) {
                signals.add(`${n.object.name}.${n.property.name}`);
              }
            }
          }
        }

        // Identifier: countSignal, myStore, etc.
        if (n.type === 'Identifier' && !functionParams.has(n.name) && isSignalOrStoreName(n.name)) {
          signals.add(n.name);
        }

        // Visit child nodes
        for (const key in n) {
          if (key === 'parent') {
            continue;
          }
          const value = n[key];
          if (Array.isArray(value)) {
            value.forEach(visit);
          } else if (value && typeof value === 'object') {
            (value as any).parent = n; // for assignment checking
            visit(value);
          }
        }
      }

      // If node is a block, visit all statements; else, visit the expression
      if (node.type === 'BlockStatement') {
        node.body.forEach(visit);
      } else {
        visit(node);
      }
      return signals;
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === 'Identifier' &&
          (node.callee.name === 'useSerializer$' || node.callee.name === 'createSerializer$')
        ) {
          const arg = node.arguments[0];
          if (
            arg &&
            (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')
          ) {
            // Find the returned object
            let returnValue: TSESTree.ObjectExpression | undefined;
            if (arg.body.type === 'BlockStatement') {
              const ret = arg.body.body.find((stmt) => stmt.type === 'ReturnStatement') as
                | TSESTree.ReturnStatement
                | undefined;
              if (ret && ret.argument && ret.argument.type === 'ObjectExpression') {
                returnValue = ret.argument;
              }
            } else if (arg.body.type === 'ObjectExpression') {
              returnValue = arg.body;
            }

            if (returnValue) {
              const updateProp = returnValue.properties.find(
                (p) =>
                  p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'update'
              ) as TSESTree.Property | undefined;
              const deserializeProp = returnValue.properties.find(
                (p) =>
                  p.type === 'Property' &&
                  p.key.type === 'Identifier' &&
                  p.key.name === 'deserialize'
              ) as TSESTree.Property | undefined;

              if (updateProp && deserializeProp) {
                const updateFn = updateProp.value;
                const deserializeFn = deserializeProp.value;

                // Only support function expressions for now
                if (
                  (updateFn.type === 'ArrowFunctionExpression' ||
                    updateFn.type === 'FunctionExpression') &&
                  (deserializeFn.type === 'ArrowFunctionExpression' ||
                    deserializeFn.type === 'FunctionExpression')
                ) {
                  const updateSignals = collectSignalsFromFunction(updateFn.body);
                  const deserializeSignals = collectSignalsFromFunction(deserializeFn.body);

                  // Check both directions
                  const missingInDeserialize = Array.from(updateSignals).filter(
                    (signal) => !deserializeSignals.has(signal)
                  );
                  const missingInUpdate = Array.from(deserializeSignals).filter(
                    (signal) => !updateSignals.has(signal)
                  );

                  const allMissingSignals = [...missingInDeserialize, ...missingInUpdate];

                  if (allMissingSignals.length > 0) {
                    context.report({
                      node: updateProp,
                      messageId: 'serializerSignalMismatch',
                      data: {
                        signals: allMissingSignals.join(', '),
                      },
                    });
                  }
                }
              }
            }
          }
        }
      },
    };
  },
});

const serializerSignalMismatchGood = `
import { useSignal, useSerializer$ } from '@qwik.dev/core';
import MyClass from './my-class';

export default component$(() => {
  const countSignal = useSignal(0);
  
  useSerializer$(() => ({
    deserialize: () => new MyClass(countSignal.value),
    update: (myClass) => {
      myClass.count = countSignal.value;
      return myClass;
    }
  }));

  return <div>{myClass.count}</div>;
});`.trim();

const serializerSignalMismatchBad = `
import { useSignal, useSerializer$ } from '@qwik.dev/core';
import MyClass from './my-class';

export default component$(() => {
  const countSignal = useSignal(0);
  
  useSerializer$(() => ({
    deserialize: (count) => new MyClass(count),
		initial: 2,
    update: (myClass) => {
      myClass.count = countSignal.value;
      return myClass;
    }
  }));

  return <div>{myClass.count}</div>;
});`.trim();

export const serializerSignalUsageExamples: QwikEslintExamples = {
  serializerSignalMismatch: {
    good: [
      {
        codeHighlight: '/countSignal/#a',
        code: serializerSignalMismatchGood,
      },
    ],
    bad: [
      {
        codeHighlight: '/countSignal/#a',
        code: serializerSignalMismatchBad,
        description: 'The countSignal is used in update() but not in deserialize()',
      },
    ],
  },
};
