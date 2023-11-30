import { Slot, component$ } from "@builder.io/qwik";

import type { Session } from "@auth/core/types";
import { routeLoader$ } from "@builder.io/qwik-city";

export const useUserSession = routeLoader$(({ sharedMap, redirect }) => {
  const session = sharedMap.get("session") as Session | null;
  if (!session) {
    // if not authorized user try to access app page then redirect to login page
    throw redirect(307, "/");
  }
});

export default component$(() => {
  return <Slot />;
});
