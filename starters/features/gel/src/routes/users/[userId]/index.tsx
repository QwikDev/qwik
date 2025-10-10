import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { executeQuery } from "../../../actions/client";
import * as queries from "../../../../dbschema/queries";

export const useGetUser = routeLoader$(async (requestEvent) => {
  const userId = requestEvent.params["userId"];
  // getUser returns an array of users, filter by name (which is userId)
  const users = await executeQuery(queries.getUser, { name: userId });
  // users is an array, so check if we got at least one
  if (!users || users.length === 0) {
    requestEvent.status(404);
    return null;
  }
  // Return the first user found
  return users[0];
});

export default component$(() => {
  const user = useGetUser();
  return (
    <section>
      <h1>User detail</h1>
      {user.value ? (
        <>
          <p>Name: {user.value.name}</p>
          {/* Show all emails if available */}
          {user.value.emails && user.value.emails.length > 0 ? (
            <ul>
              {user.value.emails.map((email: any) => (
                <li key={email.id}>
                  Email: {email.address}
                  {email.provider ? <> (Provider: {email.provider})</> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No emails found for this user.</p>
          )}
        </>
      ) : (
        <p>User not found</p>
      )}
    </section>
  );
});
