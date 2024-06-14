import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { schema } from "../../../../drizzle/schema";

export const useGetUser = routeLoader$(async (requestEvent) => {
  const userId = parseInt(requestEvent.params["userId"], 10);
  const sqlite = new Database("./drizzle/db/db.sqlite");
  const db = drizzle(sqlite, { schema });
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
  });
  if (!user) {
    // Set the status to 404 if the user is not found
    requestEvent.status(404);
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
