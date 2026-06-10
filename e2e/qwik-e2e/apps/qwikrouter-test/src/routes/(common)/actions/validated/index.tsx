import { component$ } from '@qwik.dev/core';
import { routeAction$, routeLoader$, validator$, z, zod$ } from '@qwik.dev/router';
import type {
  ActionOptions,
  JSONObject,
  RequestEventAction,
  ValidatorErrorType,
} from 'packages/qwik-router/src/runtime/src/types';

type TypedDataValidatorError = ValidatorErrorType<{
  category: 'bird' | 'dog' | 'rat';
}>;

const typedDataValidator = zod$({
  category: z.enum(['bird', 'dog', 'rat']),
});

interface DataValidatorError {
  message: string;
}

const dataValidator = validator$((ev) => {
  if (ev.query.get('secret') === '123') {
    return {
      success: true,
    };
  }
  return {
    success: false,
    error: {
      message: 'Secret not found',
    } as DataValidatorError,
  };
});

interface ActionSuccessObject {
  actionSuccess: string;
}

const actionQrl = (data: JSONObject, { error }: RequestEventAction) => {
  if (Math.random() > 0.5) {
    throw error(500, {
      actionFail: 'secret',
    });
  }

  return {
    actionSuccess: 'シマエナガ',
  } as ActionSuccessObject;
};

export const useLoader = routeLoader$(() => {
  return {
    stuff: 'hello',
  };
}, dataValidator);

export const useAction1 = routeAction$(actionQrl, {
  validation: [typedDataValidator, dataValidator],
} as ActionOptions);
export const useAction2 = routeAction$(actionQrl, {
  validation: [typedDataValidator],
} as ActionOptions);
export const useAction3 = routeAction$(actionQrl, {
  validation: [dataValidator],
} as ActionOptions);
export const useAction4 = routeAction$(actionQrl, typedDataValidator, dataValidator);
export const useAction5 = routeAction$(actionQrl, typedDataValidator);
export const useAction6 = routeAction$(actionQrl, dataValidator);
export const useAction7 = routeAction$(actionQrl);
export const useAction8 = routeAction$(actionQrl, { id: 'id-action-8' });

export default component$(() => {
  const loader = useLoader();

  // Use options object, use typed data validator, use data validator
  const action1 = useAction1();
  if (action1.error) {
    action1.error.data satisfies TypedDataValidatorError | DataValidatorError;
  } else if (action1.value) {
    action1.value satisfies ActionSuccessObject;
  }

  // Use options object, use typed data validator
  const action2 = useAction2();
  if (action2.error) {
    action2.error.data satisfies TypedDataValidatorError;
  } else if (action2.value) {
    action2.value satisfies ActionSuccessObject;
  }

  // Use options object, use data validator
  const action3 = useAction3();
  if (action3.error) {
    action3.error.data satisfies DataValidatorError;
  } else if (action3.value) {
    action3.value satisfies ActionSuccessObject;
  }

  // Use typed data validator, use data validator
  const action4 = useAction4();
  if (action4.error) {
    action4.error.data satisfies TypedDataValidatorError | DataValidatorError;
  } else if (action4.value) {
    action4.value satisfies ActionSuccessObject;
  }

  // Use typed data validator
  const action5 = useAction5();
  if (action5.error) {
    action5.error.data satisfies TypedDataValidatorError;
  } else if (action5.value) {
    action5.value satisfies ActionSuccessObject;
  }

  // Use data validator
  const action6 = useAction6();
  if (action6.error) {
    action6.error.data satisfies DataValidatorError;
  } else if (action6.value) {
    action6.value satisfies ActionSuccessObject;
  }

  // No validators
  const action7 = useAction7();
  if (action7.error) {
    action7.error.data satisfies unknown;
  } else if (action7.value) {
    action7.value satisfies ActionSuccessObject;
  }

  // No validators, with action id
  const action8 = useAction7();
  if (action8.error) {
    action8.error.data satisfies unknown;
  } else if (action8.value) {
    action8.value satisfies ActionSuccessObject;
  }

  return (
    <div>
      <h1>Validated</h1>
      {loader.error ? (
        <div>
          <p>Failed</p>
          <p>{loader.error.message}</p>
        </div>
      ) : (
        <div>
          <p>Success</p>
          <p>{loader.value.stuff}</p>
        </div>
      )}
    </div>
  );
});
