import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { getAllUsers } from "../../actions/user";

export const useGetAllUsers = routeLoader$(async () => {
  const users = await getAllUsers();
  return users;
});

export default component$(() => {
  const users = useGetAllUsers().value;

  return (
    <section>
      <h1>Users Directory</h1>
      <ul>
        {Array.isArray(users) && users.length > 0 ? (
          users.map((user: any) => (
            <li key={user.id ?? user.name}>
              <b>Name:</b> {user.name}
              {user.email && (
                <div style={{ marginLeft: "1rem" }}>
                  <span>
                    <b>Email:</b> {user.email}
                  </span>
                </div>
              )}
            </li>
          ))
        ) : (
          <li>No users found.</li>
        )}
      </ul>
    </section>
  );
});
