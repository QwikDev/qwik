import { routeLoader$ } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";
import { db } from "../../../../prisma/db";

export const useGetUser = routeLoader$(async ({ params, status }) => {
  const userId = parseInt(params["userId"], 10);
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user) {
    // Set the status to 404 if the user is not found
    status(404);
  }
  return user;
});

export default component$(() => {
  const user = useGetUser();
  return (
    <section>
      <h1>User detail</h1>
      {user.value ? (
        <>
          <p>Name: {user.value.name}</p>
          <p>Email: {user.value.email}</p>
        </>
      ) : (
        <p>User not found</p>
      )}
    </section>
  );
});
