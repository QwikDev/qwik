import { PrismaClient } from "@prisma/client";
import { routeLoader$ } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

export const useGetUsers = routeLoader$(async () => {
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany();
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
