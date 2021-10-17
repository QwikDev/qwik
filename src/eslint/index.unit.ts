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
import { qComponent } from '../core/component/q-component.public';
import { qHook } from '../core/component/qrl-hook.public';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
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
  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook((props) => ({ count: props.value || 0 })),
    onRender: qHook(({ value, step }, state, args) => {
      const innerConst = 123;
      qHook<typeof Counter>(({ value, step }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
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
  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook((props) => ({ count: props.value || 0 })),
    onRender: qHook(({ value, step }, state, args) => {
      const innerConst = 123;
      qHook<typeof Counter>(({ value, step }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
        state; // qHook state
        args; // qHook args
        return () => {
          local; // closed over qHook inner function
        };
      });
      qHook<typeof Counter>(({ value, step }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
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
  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(async (props) => ({ count: props.value || 0 })),
    onRender: qHook(async ({ value, step }, state, args) => {
      const innerConst = 123;
      qHook<typeof Counter>(async ({ value, step }, state, args) => {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
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
  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(function (props) {
      return { count: props.value || 0 };
    }),
    onRender: qHook(function ({ value, step }, state, args) {
      const innerConst = 123;
      qHook<typeof Counter>(function ({ value, step }, state, args) {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
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
  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(async function (props) {
      return { count: props.value || 0 };
    }),
    onRender: qHook(async function ({ value, step }, state, args) {
      const innerConst = 123;
      qHook<typeof Counter>(async function ({ value, step }, state, args) {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
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
  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(function (props) {
      return { count: props.value || 0 };
    }),
    onRender: qHook(({ value, step }, state, args) => {
      const innerConst = 123;
      qHook<typeof Counter>(function ({ value, step }, state, args) {
        const local = 123;
        local; // local var
        rules; // import
        ruleTester; // top level var
        value; // qHook param
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
 * VALID qHook - qHook defined outside qComponent should not report an error
 */
function validStandaloneQHook() {
  const Counter_click = qHook((props, state) => {
    state;
    const local = 123;
    local; // OK: Reference to local vars is OK.
    rules; // OK: Reference to import is OK.
    ruleTester; // OK: Reference to top level is OK.
  });
}

/**
 * INVALID qComponent - arrow function
 */
function invalidArrowFunctionExpression() {
  const Counter_click = qHook((props, state) => {
    state;
  });

  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook((props) => ({ count: props.value || 0 })),
    onRender: qHook(({ value, step }, state, args) => {
      const innerConst = 123;
      function innerFn() {}
      const { innerSpread } = args as any;
      qHook<typeof Counter>(() => {
        const local = 123;
        local; // OK: Reference to local vars is OK.
        rules; // OK: Reference to import is OK.
        ruleTester; // OK: Reference to top level is OK.

        value; // ERROR: can't access parent scope
        step; // ERROR: can't access parent scope
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
  const Counter_click = qHook((props, state) => {
    state;
  });

  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook((props) => ({ count: props.value || 0 })),
    onRender: qHook(({ value, step }, state, args) => {
      const innerConst = 123;
      function innerFn() {}
      const { innerSpread } = args as any;
      qHook<typeof Counter>(() => {
        const local = 123;
        local; // OK: Reference to local vars is OK.
        rules; // OK: Reference to import is OK.
        ruleTester; // OK: Reference to top level is OK.

        value; // ERROR: can't access parent scope
        step; // ERROR: can't access parent scope
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
      qHook<typeof Counter>(() => {
        const local = 123;
        local; // OK: Reference to local vars is OK.
        rules; // OK: Reference to import is OK.
        ruleTester; // OK: Reference to top level is OK.

        value; // ERROR: can't access parent scope
        step; // ERROR: can't access parent scope
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
 * INVALID qComponent - async arrow function
 */
function invalidAsyncArrowFunctionExpression() {
  const Counter_click = qHook(async (props, state) => {
    state;
  });

  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(async (props) => ({ count: props.value || 0 })),
    onRender: qHook(async ({ value, step }, state, args) => {
      qHook<typeof Counter>(async ({ value, step }) => {
        state;
      });
    }),
  });
}

/**
 * INVALID qComponent - function
 */
function invalidFunctionExpression() {
  const Counter_click = qHook(function (props, state) {
    state;
  });

  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(function (props) {
      return { count: props.value || 0 };
    }),
    onRender: qHook(function ({ value, step }, state, args) {
      qHook<typeof Counter>(function ({ value, step }) {
        state;
      });
    }),
  });
}

/**
 * INVALID qComponent - async function
 */
function invalidAsyncFunctionExpression() {
  const Counter_click = qHook(async function (props, state) {
    state;
  });

  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(async function (props) {
      return { count: props.value || 0 };
    }),
    onRender: qHook(async function ({ value, step }, state, args) {
      qHook<typeof Counter>(async function ({ value, step }) {
        state;
      });
    }),
  });
}

/**
 * INVALID qComponent - arrow function x function
 */
function invalidArrowFunctionFunctionExpression() {
  const Counter_click = qHook((props, state) => {
    state;
  });

  const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
    onMount: qHook(function (props) {
      return { count: props.value || 0 };
    }),
    onRender: qHook(({ value, step }, state, args) => {
      const innerConst = 123;
      qHook<typeof Counter>(function ({ value, step }) {
        state;
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
    {
      code: validStandaloneQHook.toString(),
    },
  ],
  invalid: [
    {
      code: invalidArrowFunctionExpression.toString(),
      errors: [
        {
          message: 'value is closed over.',
          line: 16,
          column: 17,
        },
        {
          message: 'step is closed over.',
          line: 17,
          column: 17,
        },
        {
          message: 'state is closed over.',
          line: 18,
          column: 17,
        },
        {
          message: 'args is closed over.',
          line: 19,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 20,
          column: 17,
        },
        {
          message: 'innerFn is closed over.',
          line: 21,
          column: 17,
        },
        {
          message: 'innerSpread is closed over.',
          line: 22,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 25,
          column: 21,
        },
      ],
    },
    {
      code: invalidArrowFunctionExpressionDuplicated.toString(),
      errors: [
        {
          message: 'value is closed over.',
          line: 16,
          column: 17,
        },
        {
          message: 'step is closed over.',
          line: 17,
          column: 17,
        },
        {
          message: 'state is closed over.',
          line: 18,
          column: 17,
        },
        {
          message: 'args is closed over.',
          line: 19,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 20,
          column: 17,
        },
        {
          message: 'innerFn is closed over.',
          line: 21,
          column: 17,
        },
        {
          message: 'innerSpread is closed over.',
          line: 22,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 25,
          column: 21,
        },
        // dups
        {
          message: 'value is closed over.',
          line: 33,
          column: 17,
        },
        {
          message: 'step is closed over.',
          line: 34,
          column: 17,
        },
        {
          message: 'state is closed over.',
          line: 35,
          column: 17,
        },
        {
          message: 'args is closed over.',
          line: 36,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 37,
          column: 17,
        },
        {
          message: 'innerFn is closed over.',
          line: 38,
          column: 17,
        },
        {
          message: 'innerSpread is closed over.',
          line: 39,
          column: 17,
        },
        {
          message: 'innerConst is closed over.',
          line: 42,
          column: 21,
        },
      ],
    },
    {
      code: invalidAsyncArrowFunctionExpression.toString(),
      errors: [
        {
          message: 'state is closed over.',
          line: 9,
          column: 17,
        },
      ],
    },
    {
      code: invalidFunctionExpression.toString(),
      errors: [
        {
          message: 'state is closed over.',
          line: 11,
          column: 17,
        },
      ],
    },
    {
      code: invalidAsyncFunctionExpression.toString(),
      errors: [
        {
          message: 'state is closed over.',
          line: 11,
          column: 17,
        },
      ],
    },
    {
      code: invalidArrowFunctionFunctionExpression.toString(),
      errors: [
        {
          message: 'state is closed over.',
          line: 12,
          column: 17,
        },
      ],
    },
  ],
});
