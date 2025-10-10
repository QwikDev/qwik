import { component$ } from "@builder.io/qwik";
import { useGetUsers } from "../../hooks/user.hooks";

// Issues with the original code:
// 1. The comment says "Call useGetUsers with an empty object", but it's called with no arguments. If useGetUsers expects an argument, this could be a bug.
// 2. The key for each <li> is user.name. If user.name is not unique, this could cause rendering issues. It's better to use a unique id if available.
// 3. The code assumes users.value is always defined before mapping. If users.value is undefined/null, it could cause errors. The check is present, but if users.value is not an array, it could still fail.
// 4. The apostrophe in <h1>User's directory</h1> is grammatically odd. "Users Directory" or "User Directory" is more standard.
// 5. The code uses any for user and email, which loses type safety. If possible, use proper types.
// 6. The emails are shown as a comma-separated string inside the link, which may not be ideal for accessibility or clarity.

export default component$(async () => {
  // If useGetUsers expects an argument, pass an empty object; otherwise, leave as is.
  const users = await useGetUsers();
  console.log(users.value);

  return (
    <section>
      <h1>Users Directory</h1>
      <ul>
        {Array.isArray(users.value) && users.value.length > 0 ? (
          users.value.map((user: any) => (
            <li key={user.id ?? user.name}>
              <a href={`/users/${user.name}`}>{user.name}</a>
              {user.emails && user.emails.length > 0 && (
                <ul>
                  {user.emails.map((email: any) => (
                    <li key={email.id ?? email.address}>
                      {email.address}
                      {email.provider ? ` (${email.provider})` : ""}
                    </li>
                  ))}
                </ul>
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
