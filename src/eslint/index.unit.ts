/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/* eslint-disable */
import { RuleTester } from 'eslint';
import { rules } from './index';

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2021 },
  parser: require.resolve('@typescript-eslint/parser'),
});

/**
 * Customize RuleTester describe & it blocks
 */
(RuleTester as any).describe = function (name: any, fn: any) {
  (RuleTester as any).it.title = name;
  return fn.call(this);
};
(RuleTester as any).it = function (name: any, fn: any) {
  // NOTE: we need to customize the test case name, it's too verbose otherwise - whole function string
  const fnName = name.match(/function(.*?)\(/)[1].trim();
  it('eslint › ' + (RuleTester as any).it.title + ' › ' + fnName, fn);
};

/**
 * VALID qComponent - arrow function
 */
function validArrowFunctionExpression() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(({ item, canEdit }, state, args) => {
      const innerConst = 123;
      qHook(({ item, canEdit }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
    }),
  });
}

/**
 * VALID qComponent - arrow function - duplicated declaration
 */
function validArrowFunctionExpressionDuplicated() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(({ item, canEdit }, state, args) => {
      const innerConst = 123;
      qHook(({ item, canEdit }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
      qHook(({ item, canEdit }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
    }),
  });
}

/**
 * VALID qComponent - async arrow function
 */
function validAsyncArrowFunctionExpression() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(async ({ item, canEdit }, state, args) => {
      const innerConst = 123;
      qHook(async ({ item, canEdit }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
    }),
  });
}

/**
 * VALID qComponent - function
 */
function validFunctionExpression() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(function ({ item, canEdit }, state, args) {
      const innerConst = 123;
      qHook(function ({ item, canEdit }, state, args) {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
    }),
  });
}

/**
 * VALID qComponent - async function
 */
function validAsyncFunctionExpression() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(async function ({ item, canEdit }, state, args) {
      const innerConst = 123;
      qHook(async function ({ item, canEdit }, state, args) {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
    }),
  });
}

/**
 * VALID qComponent - arrow function x function
 */
function validArrowFunctionFunctionExpression() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(({ item, canEdit }, state, args) => {
      const innerConst = 123;
      qHook(function ({ item, canEdit }, state, args) {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        item; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
    }),
  });
}

/**
 * INVALID qComponent - arrow function
 */
function invalidArrowFunctionExpression() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(({ item, canEdit }, state, args) => {
      const innerConst = 123;
      function innerFn() {}
      const { innerSpread } = args;
      qHook(() => {
        const local = 123;
        local; // OK: Reference to local vars is OK.
        rules; // OK: Reference to import is OK.
        ruleTester; // OK: Reference to top level is OK.

        item; // ERROR: can't access parent scope
        canEdit; // ERROR: can't access parent scope
        state; // ERROR: can't access parent scope
        args; // ERROR: can't access parent scope
        innerConst; // ERROR: reference to `inner` is not allowed as it closes over non-top-level variable
        innerFn(); // ERROR: innerFn can't be accesssed
        innerSpread; // ERROR: innerSpread can't be accessed
        return () => {
          local; // Closing over `qHook` inner functions is OK inside nested closures.
          innerConst; // ERROR: reference to `inner` is not allowed as it closes over non-top-level variable
        };
      });
    }),
  });
}

/**
 * INVALID qComponent - arrow function - duplicated declaration
 */
function invalidArrowFunctionExpressionDuplicated() {
  qComponent({
    onMount: qHook(() => ({ text: '' })),
    onRender: qHook(({ item, canEdit }, state, args) => {
      const innerConst = 123;
      function innerFn() {}
      const { innerSpread } = args;
      qHook(() => {
        const local = 123;
        local; // OK: Reference to local vars is OK.
        rules; // OK: Reference to import is OK.
        ruleTester; // OK: Reference to top level is OK.

        item; // ERROR: can't access parent scope
        canEdit; // ERROR: can't access parent scope
        state; // ERROR: can't access parent scope
        args; // ERROR: can't access parent scope
        innerConst; // ERROR: reference to `inner` is not allowed as it closes over non-top-level variable
        innerFn(); // ERROR: innerFn can't be accesssed
        innerSpread; // ERROR: innerSpread can't be accessed
        return () => {
          local; // Closing over `qHook` inner functions is OK inside nested closures.
          innerConst; // ERROR: reference to `inner` is not allowed as it closes over non-top-level variable
        };
      });
      qHook(() => {
        const local = 123;
        local; // OK: Reference to local vars is OK.
        rules; // OK: Reference to import is OK.
        ruleTester; // OK: Reference to top level is OK.

        item; // ERROR: can't access parent scope
        canEdit; // ERROR: can't access parent scope
        state; // ERROR: can't access parent scope
        args; // ERROR: can't access parent scope
        innerConst; // ERROR: reference to `inner` is not allowed as it closes over non-top-level variable
        innerFn(); // ERROR: innerFn can't be accesssed
        innerSpread; // ERROR: innerSpread can't be accessed
        return () => {
          local; // Closing over `qHook` inner functions is OK inside nested closures.
          innerConst; // ERROR: reference to `inner` is not allowed as it closes over non-top-level variable
        };
      });
    }),
  });
}

/**
 * RUN valid & invalid test cases
 */
ruleTester.run('no-closed-over-variables', rules['no-closed-over-variables'], {
  valid: [
    {
      code: validArrowFunctionExpression.toString(),
    },
    {
      code: validArrowFunctionExpressionDuplicated.toString(),
    },
    {
      code: validAsyncArrowFunctionExpression.toString(),
    },
    {
      code: validFunctionExpression.toString(),
    },
    {
      code: validAsyncFunctionExpression.toString(),
    },
    {
      code: validArrowFunctionFunctionExpression.toString(),
    },
  ],
  invalid: [
    {
      code: invalidArrowFunctionExpression.toString(),
      errors: [
        {
          message: 'item is closed over.',
          line: 13,
          column: 17,
        },
        {
          message: 'canEdit is closed over.',
          line: 14,
          column: 17,
        },
        {
          message: 'state is closed over.',
          line: 15,
          column: 17,
        },
        {
          message: 'args is closed over.',
          line: 16,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 17,
          column: 17,
        },
        {
          message: 'innerFn is closed over.',
          line: 18,
          column: 17,
        },
        {
          message: 'innerSpread is closed over.',
          line: 19,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 22,
          column: 21,
        },
      ],
    },
    {
      code: invalidArrowFunctionExpressionDuplicated.toString(),
      errors: [
        {
          message: 'item is closed over.',
          line: 13,
          column: 17,
        },
        {
          message: 'canEdit is closed over.',
          line: 14,
          column: 17,
        },
        {
          message: 'state is closed over.',
          line: 15,
          column: 17,
        },
        {
          message: 'args is closed over.',
          line: 16,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 17,
          column: 17,
        },
        {
          message: 'innerFn is closed over.',
          line: 18,
          column: 17,
        },
        {
          message: 'innerSpread is closed over.',
          line: 19,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 22,
          column: 21,
        },
        // dups
        {
          message: 'item is closed over.',
          line: 30,
          column: 17,
        },
        {
          message: 'canEdit is closed over.',
          line: 31,
          column: 17,
        },
        {
          message: 'state is closed over.',
          line: 32,
          column: 17,
        },
        {
          message: 'args is closed over.',
          line: 33,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 34,
          column: 17,
        },
        {
          message: 'innerFn is closed over.',
          line: 35,
          column: 17,
        },
        {
          message: 'innerSpread is closed over.',
          line: 36,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 39,
          column: 21,
        },
      ],
    },
  ],
});

/**
 * qHook, qComponent marker functions
 *
 * - TODO: once PR#50 https://github.com/BuilderIO/qwik/pull/50 is merged, use real import
 */
function qHook(cb: (props?: any, state?: any, args?: any) => any) {
  cb();
}
function qComponent(obj: any) {}
