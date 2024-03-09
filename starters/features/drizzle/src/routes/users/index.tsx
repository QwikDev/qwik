import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { schema } from "../../../drizzle/schema";

export const useGetUsers = routeLoader$(async () => {
  const sqlite = new Database("./drizzle/db/db.sqlite");
  const db = drizzle(sqlite, { schema });
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
