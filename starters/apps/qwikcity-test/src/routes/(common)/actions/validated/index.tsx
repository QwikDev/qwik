import { component$ } from "@builder.io/qwik";
import {
  routeAction$,
  routeLoader$,
  validator$,
  z,
  zod$,
} from "@builder.io/qwik-city";
import type {
  JSONObject,
  RequestEventAction,
} from "packages/qwik-city/runtime/src/types";

const typedDataValidator = zod$({
  category: z.enum(["bird", "dog", "rat"]),
});

const dataValidator = validator$((ev) => {
  if (ev.query.get("secret") === "123") {
    return {
      success: true,
    };
  }
  return {
    success: false,
    error: {
      message: "Secret not found",
    },
  };
});

const actionQrl = (data: JSONObject, { fail }: RequestEventAction) => {
  if (Math.random() > 0.5) {
    return fail(500, {
      actionFail: "secret",
    });
  }

  return {
    actionSuccess: "シマエナガ",
  };
};

export const useLoader = routeLoader$(() => {
  return {
    stuff: "hello",
  };
}, dataValidator);

export const useAction1 = routeAction$(actionQrl, {
  validation: [typedDataValidator, dataValidator],
});
export const useAction2 = routeAction$(actionQrl, {
  validation: [typedDataValidator],
});
export const useAction3 = routeAction$(actionQrl, {
  validation: [dataValidator],
});
export const useAction4 = routeAction$(
  actionQrl,
  typedDataValidator,
  dataValidator,
);
export const useAction5 = routeAction$(actionQrl, typedDataValidator);
export const useAction6 = routeAction$(actionQrl, dataValidator);
export const useAction7 = routeAction$(actionQrl);

export default component$(() => {
  const loader = useLoader();
  const action1 = useAction1();
  const action2 = useAction2();
  const action3 = useAction3();
  const action4 = useAction4();
  const action5 = useAction5();
  const action6 = useAction6();
  const action7 = useAction7();

  return (
    <div>
      <h1>Validated</h1>
      {loader.value.failed ? (
        <div>
          <p>Failed</p>
          <p>{loader.value.message}</p>
        </div>
      ) : (
        <div>
          <p>Success</p>
          <p>{loader.value.stuff}</p>
        </div>
      )}
      <div>
        <h2>
          Use options object, use typed data validator, use data validator
        </h2>
        {action1.value?.actionSuccess}
        {action1.value?.actionFail}
        {action1.value?.message}
        {action1.value?.fieldErrors?.category}
        {action1.value?.formErrors}
      </div>
      <div>
        <h2>Use options object, use typed data validator</h2>
        {action2.value?.actionSuccess}
        {action2.value?.actionFail}
        {action2.value?.fieldErrors?.category}
        {action2.value?.formErrors}
      </div>
      <div>
        <h2>Use options object, use data validator</h2>
        {action3.value?.actionSuccess}
        {action3.value?.actionFail}
        {action3.value?.message}
      </div>
      <div>
        <h2>Use typed data validator, use data validator</h2>
        {action4.value?.actionSuccess}
        {action4.value?.actionFail}
        {action4.value?.message}
        {action4.value?.fieldErrors?.category}
        {action4.value?.formErrors}
      </div>
      <div>
        <h2>Use typed data validator</h2>
        {action5.value?.actionSuccess}
        {action5.value?.actionFail}
        {action5.value?.fieldErrors?.category}
        {action5.value?.formErrors}
      </div>
      <div>
        <h2>Use data validator</h2>
        {action6.value?.actionSuccess}
        {action6.value?.actionFail}
        {action6.value?.message}
      </div>
      <div>
        <h2>No validators</h2>
        {action7.value?.actionSuccess}
        {action7.value?.actionFail}
      </div>
    </div>
  );
});
