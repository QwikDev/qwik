import { component$ } from "@builder.io/qwik";
import {
  routeAction$,
  routeLoader$,
  validator$,
  z,
  zod$,
} from "@builder.io/qwik-city";
import type { JSONObject } from "packages/qwik-city/runtime/src/types";

const queryContainsSecret = validator$((ev) => {
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

export const useLoader = routeLoader$(() => {
  return {
    stuff: "hello",
  };
}, queryContainsSecret);

export const useAction1 = routeAction$((value) => {
  return value satisfies JSONObject;
}, queryContainsSecret);

export const useAction2 = routeAction$(
  (input) => {
    return input satisfies {
      name: string;
    };
  },
  zod$({
    name: z.string(),
  }),
  queryContainsSecret,
);

export const useAction3 = routeAction$((input, { fail }) => {
  if (Math.random() > 1.0) {
    return fail(500, {
      error: "Random error",
    });
  }
  return {
    success: input.name as string,
  };
});

// export const useAction3 = routeAction$((input) => {

//   return input satisfies {
//     name: string;
//   };
// }, {
//   id: 'action-2',
//   validators: [
//     zod$({name: z.string()}),
//     queryContainsSecret
//   ]
// });

export default component$(() => {
  const loader = useLoader();
  const action = useAction3();

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
        {action.value?.success}
        {action.value?.error}
      </div>
    </div>
  );
});
