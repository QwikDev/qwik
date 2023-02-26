import { routeAction$, routeLoader$, validator$, z, zod$ } from "@builder.io/qwik-city";
import type { JSONObject } from "packages/qwik-city/runtime/src/types";


const queryContainsSecret = validator$((ev) => {
  if (ev.query.get('secret') === '123') {
    return {
      success: true,
    }
  }
  return {
    success: false
  }
});

export const useLoader = routeLoader$(() => {
  return {
    stuff: 'hello'
  }
}, queryContainsSecret);

export const useAction1 = routeAction$((value) => {
  return value satisfies JSONObject;
}, queryContainsSecret);

export const useAction2 = routeAction$((input) => {
  return input satisfies {
    name: string;
  };
}, zod$({
  name: z.string(),
}),
queryContainsSecret
);

export const useAction3 = routeAction$((input) => {

  return input satisfies {
    name: string;
  };
}, {
  id: 'action-2',
  validators: [
    zod$({name: z.string()}),
    queryContainsSecret
  ]
});
