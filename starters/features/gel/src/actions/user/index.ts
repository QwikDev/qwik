import { server$ } from "@builder.io/qwik-city";
import { executeQuery } from "../../actions/client";
import * as queries from "../../../dbschema/queries";

export const getAllUsers = server$(async () => {
  return await executeQuery(queries.getAllUsers);
});

export const getUserByName = server$(async (name: string) => {
  return await executeQuery(queries.getUser, { name: name });
});

export const getUserByEmail = server$(async (email: string) => {
  return await executeQuery(queries.getUser, { email: email });
});

export const insertUser = server$(
  async (name: string, email: string, has_profile: boolean) => {
    return await executeQuery(queries.insertUser, {
      name: name,
      email: email,
      has_profile: has_profile,
    });
  },
);
