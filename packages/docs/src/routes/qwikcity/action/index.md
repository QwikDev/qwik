---
title: Qwik City - action$()
contributors:
  - manucorporat
---

# `action$()`

Server actions look similar to loaders, but they are never executed eagerly during rendering. Instead, they run after some user interaction, such as a click or a form submission.

## Declaring an action

Actions are declared in the same way as loaders, only inside a `layout.tsx` or `index.tsx` file, and they MUST be exported.

```tsx
// src/routes/layout.tsx
import { action$ } from '@builder.io/qwik';
export const addUser = action$((user) => {
  const userID = db.users.add(user);
  return {
    success: true,
    userID,
  };
});
```

> Since actions are not executed during rendering, they can have side effects such as writing to a database, or sending an email. An action only runs when called explicitly.

## Using an action

Actions are consumed using the `.use()` method from within a Qwik Component. The `use()` method returns `ActionUtils` object with methods to trigger the action and get its state.

```tsx
// src/routes/index.tsx

import { action$ } from '@builder.io/qwik-city';
import { component$ } from '@builder.io/qwik';

export const addUser = action$((user) => {
  const userID = db.users.add(user);
  return {
    success: true,
    userID,
  };
});

export default component$(() => {
  const action = addUser.use();
  return (
    <div>
      <button onClick={() => action.run({ name: 'John' })}>Add user</button>
      {action.value?.success && <div>User added successfully</div>}
    </div>
  );
});
```

In the example above, the `addUser` action is triggered when the user clicks the button. The `action.run()` method returns a `Promise` that resolves when the action is done.

### `<Form/>`

The best way to trigger an action is by using the `<Form/>` component exported in `@builder.io/qwik-city`.

```tsx
// src/routes/index.tsx

import { action$, Form } from '@builder.io/qwik-city';
import { component$ } from '@builder.io/qwik';

export const addUser = action$((user) => {
  const userID = db.users.add(user);
  return {
    success: true,
    userID,
  };
});

export default component$(() => {
  const action = addUser.use();
  return (
    <Form action={action}>
      <input name="name" />
      <button type="submit">Add user</button>
      {action.value?.success && <div>User added successfully</div>}
    </Form>
  );
});
```

Under the hood, the `<Form/>` component uses a native HTML `<form>` element, so it will work without JavaScript. When JS is enabled, the `<Form/>` component will intercept the form submission and trigger the action in SPA mode, allowing to have a full SPA experience.

### Zod validation

When submitting data to an action by default, the data is not validated.

```tsx
// src/routes/index.tsx

import { action$, Form } from '@builder.io/qwik-city';

export const addUser = action$((user) => {
  // `user` is typed Record<string, any>
  const userID = db.users.add(user);
  return {
    success: true,
    userID,
  };
});
```

Fortunately, actions have first class support for [Zod](), a TypeScript-first data validation library. To use Zod, simply pass the Zod schema as the second argument to the `action$()` function.

```tsx
// src/routes/index.tsx

import { action$, zod$, z } from '@builder.io/qwik-city';

export const addUser = action$(
  (user) => {
    // `user` is typed { name: string }
    const userID = db.users.add(user);
    return {
      success: true,
      userID,
    };
  },
  zod$({
    name: z.string(),
  })
);
```

When submitting data to an action, the data is validated against the Zod schema. If the data is invalid, the action will put the validation error in the `action.fail` property.

```tsx
import { action$, Form } from '@builder.io/qwik-city';

export const addUser = action$(
  (user) => {
    // `user` is typed { name: string }
    const userID = db.users.add(user);
    return {
      success: true,
      userID,
    };
  },
  zod$({
    name: z.string(),
  })
);

export default component$(() => {
  const action = addUser.use();
  return (
    <Form action={action}>
      <input name="name" />
      {action.fail?.fieldErrors.name && <div>{action.fail.message}</div>}
      {action.value?.success && <div>User added successfully</div>}
      <button type="submit">Add user</button>
    </Form>
  );
});
```

Please refer to the [Zod documentation](https://zod.dev/) for more information on how to use Zod schemas.
