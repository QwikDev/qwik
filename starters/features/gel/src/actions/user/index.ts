import { server$ } from "@builder.io/qwik-city";
import { executeQuery } from "../../actions/client";
import * as queries from "../../../dbschema/queries";

export const getAllUsers = server$(async () => {
  return await executeQuery(queries.getAllUsers);
});

export const getUserByName = server$(async (name: string) => {
  return await executeQuery(queries.getUserByName, { name: name });
});

export const getUserByEmail = server$(async (email: string) => {
  return await executeQuery(queries.getUserByEmail, { email: email });
});

export const deleteUser = server$(async (name: string) => {
  return await executeQuery(queries.deleteUser, { name: name });
});

export const insertOrUpdateUser = server$(
  async (name: string, email: string) => {
    return await executeQuery(queries.insertOrUpdateUser, {
      name: name,
      email: email,
    });
  },
);
