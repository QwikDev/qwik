import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import type { NeonQueryFunction} from "@neondatabase/serverless";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "../../../../db/schema";

export const useGetUser = routeLoader$(async (requestEvent) => {
  const userId = parseInt(requestEvent.params["userId"], 10);
  const DATABASE_URL = requestEvent.env.get("DATABASE_URL");
  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql as NeonQueryFunction<boolean, boolean>, { schema });
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
