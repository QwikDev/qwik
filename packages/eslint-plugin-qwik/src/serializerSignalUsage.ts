// This was vibe-coded with AI
import { ESLintUtils } from '@typescript-eslint/utils';
import ts from 'typescript';
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
    // Check if we have TypeScript services available
    if (!context.parserServices?.program || !context.parserServices?.esTreeNodeToTSNodeMap) {
      return {};
    }

    const services = {
      program: context.parserServices.program,
      esTreeNodeToTSNodeMap: context.parserServices.esTreeNodeToTSNodeMap,
    };
    const typeChecker = services.program.getTypeChecker();

    function isSignalOrStoreType(type: ts.Type): boolean {
      if (!type.symbol) {
        // For 'any' type, check if it's being used like a store/signal
        if (type.flags & ts.TypeFlags.Any) {
          return true; // Consider 'any' as potentially a store/signal
        }
        return false;
      }

      // Check if it's a Signal or Store by name
      // Note, we don't have a Store type but we might in the future
      if (type.symbol.name === 'Signal' || type.symbol.name === 'Store') {
        return true;
      }

      // Check if it's a Signal by having a value property
      const properties = type.getProperties();
      const hasValue = properties.some((p) => p.name === 'value');
      if (hasValue) {
        return true;
      }

      // Check if it's a Store by checking if it's an object with properties
      if (type.flags & ts.TypeFlags.Object) {
        // For object types, consider them stores if they have properties
        // This catches both explicit Store types and plain objects used as stores
        return properties.length > 0;
      }

      return false;
    }

    function collectSignalsFromFunction(node: any): Set<string> {
      const signals = new Set<string>();
      const visited = new WeakSet();
      const functionParams = new Set<string>();

      // Collect function parameters first
      if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        node.params.forEach((param: any) => {
          if (param.type === 'Identifier') {
            functionParams.add(param.name);
          }
        });
      }

      function isAssignmentTarget(node: any): boolean {
        const parent = node.parent;
        if (!parent) {
          return false;
        }

        // Check if it's the left side of an assignment
        if (parent.type === 'AssignmentExpression' && parent.left === node) {
          return true;
        }

        // Check if it's the target of an update expression (++, --)
        if (parent.type === 'UpdateExpression' && parent.argument === node) {
          return true;
        }

        return false;
      }

      function visit(node: any) {
        if (!node || typeof node !== 'object' || visited.has(node)) {
          return;
        }
        visited.add(node);

        if (node.type === 'MemberExpression' && !isAssignmentTarget(node)) {
          const obj = node.object;
          if (obj?.type === 'Identifier' && !functionParams.has(obj.name)) {
            const tsNode = services.esTreeNodeToTSNodeMap.get(obj);
            if (tsNode) {
              const type = typeChecker.getTypeAtLocation(tsNode);
              if (isSignalOrStoreType(type)) {
                if (type.flags & ts.TypeFlags.Object || type.flags & ts.TypeFlags.Any) {
                  // For stores, track each property access
                  const propName = node.property?.name;
                  if (propName) {
                    signals.add(`${obj.name}.${propName}`);
                  }
                } else {
                  // For signals, track the whole signal
                  signals.add(obj.name);
                }
              }
            }
          }
        }

        // Visit specific AST properties that can contain nodes
        const properties = [
          'body',
          'expression',
          'expressions',
          'argument',
          'arguments',
          'left',
          'right',
          'object',
          'property',
        ];

        for (const prop of properties) {
          const value = node[prop];
          if (Array.isArray(value)) {
            value.forEach((v) => visit(v));
          } else if (value && typeof value === 'object') {
            value.parent = node; // Add parent reference for assignment checking
            visit(value);
          }
        }
      }

      const body = node.type === 'BlockStatement' ? node.body : [node];
      body.forEach(visit);
      return signals;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          (node.callee.name === 'useSerializer$' || node.callee.name === 'createSerializer$')
        ) {
          const arg = node.arguments[0];

          // Check if the argument is a function that returns an object
          if (arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression') {
            const returnValue =
              arg.body.type === 'BlockStatement'
                ? (arg.body.body.find((stmt: any) => stmt.type === 'ReturnStatement') as any)
                    ?.argument
                : arg.body;

            if (returnValue?.type === 'ObjectExpression') {
              const updateProp = returnValue.properties.find(
                (p) =>
                  p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'update'
              );
              const deserializeProp = returnValue.properties.find(
                (p) =>
                  p.type === 'Property' &&
                  p.key.type === 'Identifier' &&
                  p.key.name === 'deserialize'
              );

              if (updateProp && deserializeProp) {
                const updateFn = (updateProp as any).value;
                const deserializeFn = (deserializeProp as any).value;

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
