import { component$ } from "@builder.io/qwik";
import {
  routeAction$,
  Form,
  routeLoader$,
  zod$,
  z,
  globalAction$,
} from "@builder.io/qwik-city";

const useUser = routeLoader$(() => {
  const user = {
    firstName: "",
    lastName: "",
    test: 11,
  };

  return user;
});

const useUserGlobal = routeLoader$(() => {
  const user = {
    firstName: "",
    lastName: "",
    test: 11,
  };

  return user;
});

export const useAddUser = routeAction$(
  async (data, requestEvent) => {
    const res = await requestEvent.resolveValue(useUser);
    res.firstName = data.firstName;
    res.lastName = data.lastName;
    return {
      success: true,
      userID: res,
    };
  },
  zod$({
    firstName: z.string(),
    lastName: z.string(),
  }),
);

export const globalAction = globalAction$(
  async (data, requestEvent) => {
    const res = await requestEvent.resolveValue(useUserGlobal);
    res.firstName = data.globalfirstName;
    res.lastName = data.globallastName;
    return {
      success: true,
      userID: res,
    };
  },
  zod$({
    globalfirstName: z.string(),
    globallastName: z.string(),
  }),
);

export default component$(() => {
  const action = useAddUser();
  const globalstate = globalAction();
  return (
    <>
      <div id="action">
        <Form action={action}>
          <input name="firstName" />
          <input name="lastName" />
          <button type="submit" id="actionButton">
            Add user
          </button>
        </Form>
        {action.value?.success && (
          <>
            <p>User {action.value.userID.firstName} added successfully</p>
            <p>User {action.value.userID.lastName} added successfully</p>
            <p>User {action.value.userID.test} added successfully</p>
          </>
        )}
      </div>
      <div id="global">
        <Form action={globalstate}>
          <input name="globalfirstName" />
          <input name="globallastName" />
          <button type="submit" id="globalButton">
            Add user
          </button>
        </Form>
        {globalstate.value?.success && (
          <>
            <p>User {globalstate.value.userID.firstName} added successfully</p>
            <p>User {globalstate.value.userID.lastName} added successfully</p>
            <p>User {globalstate.value.userID.test} added successfully</p>
          </>
        )}
      </div>
    </>
  );
});
