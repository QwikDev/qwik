import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "../../../db/schema";

export const useGetUsers = routeLoader$(async (requestEvent) => {
  const DATABASE_URL = requestEvent.env.get("DATABASE_URL");
  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql as NeonQueryFunction<boolean, boolean>, { schema });
  const users = await db.query.users.findMany();
  return users;
});

export default component$(() => {
  const users = useGetUsers();
  return (
    <section>
      <h1>User's directory</h1>
      <ul>
        {users.value.map((user) => (
          <li key={user.id}>
            <a href={`/users/${user.id}`}>
              {user.name} ({user.email})
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
});
