/**
 * Simple Auth For Testing Only!!!
 */

import type { RequestHandler } from "@qwik.dev/router";
import { signOut } from "../../../../auth/auth";

export const onGet: RequestHandler = async ({ redirect, cookie }) => {
  signOut(cookie);
  throw redirect(302, "/qwikrouter-test/sign-in/");
};
