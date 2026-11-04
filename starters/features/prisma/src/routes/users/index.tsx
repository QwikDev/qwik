import { routeLoader$ } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";
import { db } from "../../../prisma/db";

export const useGetUsers = routeLoader$(async () => {
  return db.orm.public.User.all();
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
