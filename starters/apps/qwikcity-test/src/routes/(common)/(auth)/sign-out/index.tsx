/**
 * Simple Auth For Testing Only!!!
 */

import type { RequestHandler } from "@builder.io/qwik-city";
import { signOut } from "../../../../auth/auth";

export const onGet: RequestHandler = async ({ redirect, cookie }) => {
  signOut(cookie);
  throw redirect(302, "/qwikcity-test/sign-in/");
};
