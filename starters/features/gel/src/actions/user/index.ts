import { server$ } from "@qwik.dev/router";
import { executeQuery } from "../client";
import * as queries from "../../../gel/queries";

export const getAllUsers = server$(async () => {
  return await executeQuery(queries.getAllUsers);
});
