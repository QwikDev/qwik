import { component$, Resource } from "@builder.io/qwik";
import {
  type DocumentHead,
  Form,
  Link,
  routeLoader$,
  routeAction$,
  z,
  zod$,
} from "@builder.io/qwik-city";
import { delay } from "../../actions/login";

export const useDateLoader = routeLoader$(
  () => new Date("2021-01-01T00:00:00.000Z"),
);

export const useDependencyLoader = routeLoader$(
  async ({ params, redirect, json, resolveValue }) => {
    const formData = await resolveValue(useForm);
    await delay(100);
    if (params.id === "redirect") {
      throw redirect(302, "/qwikcity-test/");
    } else if (params.id === "redirect-welcome") {
      throw redirect(302, "/qwikcity-test/loaders/welcome/");
    } else if (params.id === "json") {
      throw json(200, { nu: 42 });
    }
    return {
      nu: 42,
      name: formData?.name ?? params.id,
    };
  },
);

const useLoader = routeLoader$(() => {
  return [
    {
      id: 1,
      product: {
        name: "test",
        options: [{ name: "first" }, { name: "second" }],
      },
    },
  ];
});

export const useAsyncLoader = routeLoader$(async ({ resolveValue }) => {
  const p1 = resolveValue(useDateLoader);
  const p2 = resolveValue(useDependencyLoader);
  if (!(p1 instanceof Promise)) {
    throw new Error("Expected date to be a promise");
  }
  if (!(p2 instanceof Promise)) {
    throw new Error("Expected dep to be a promise");
  }

  const date = await p1;
  const dep = await p2;

  return async () => {
    await delay(500);

    return {
      date: date,
      dep: dep.nu * 2,
      name: dep.name,
    };
  };
});

export const useSlowLoader = routeLoader$(async () => {
  await delay(500);
  return {
    foo: 123,
  };
});

export const useRealDateLoader = routeLoader$(() => {
  return [new Date().toISOString()];
});

export const DateCmp = component$(() => {
  const date = useRealDateLoader();
  return <p id="real-date">real-date: {date.value[0]}</p>;
});

export default component$(() => {
  const date = useDateLoader();
  const slow = useSlowLoader();
  const signal = useAsyncLoader();
  const action = useForm();
  const items = useLoader().value;
  const items3 = items.map((item) => {
    return {
      ...item,
      reversed: item.product.options.reverse(),
    };
  });
  console.warn("items3", items3);

  return (
    <div class="loaders">
      <h1>Loaders</h1>
      <DateCmp></DateCmp>
      <div>
        <p id="date">date: {date.value.toISOString()}</p>
      </div>
      <div>
        <p id="slow">slow: {slow.value.foo}</p>
      </div>
      <Resource
        value={signal}
        onResolved={(value) => {
          return (
            <div>
              <p id="nested-date">date: {value.date.toISOString()}</p>
              <p id="nested-dep">dep: {value.dep}</p>
              <p id="nested-name">name: {value.name}</p>
            </div>
          );
        }}
      />
      <Form action={action}>
        <input type="text" name="name" id="form-name" />
        <button type="submit" id="form-submit">
          Submit
        </button>
      </Form>
      <ul>
        <li>
          <Link href="/qwikcity-test/loaders/stuff/" id="link-stuff">
            To Stuff
          </Link>
        </li>
        <li>
          <Link href="/qwikcity-test/loaders/redirect/" id="link-redirect">
            To Redirect home
          </Link>
        </li>
        <li>
          <Link
            href="/qwikcity-test/loaders/redirect-welcome/"
            id="link-welcome"
          >
            To Redirect /loaders/welcome/
          </Link>
        </li>
      </ul>
    </div>
  );
});

export const useForm = routeAction$(
  async (stuff) => {
    return stuff;
  },
  zod$({
    name: z.string(),
  }),
);

export const useFormWithError = routeAction$(async (stuff, { fail }) => {
  if (Math.random() > 2) {
    return fail(500, {
      message: "Random error",
    });
  }
  return {
    name: stuff.name as string,
  };
});

export const head: DocumentHead = ({ resolveValue }) => {
  const date = resolveValue(useDateLoader);
  const dep = resolveValue(useDependencyLoader);
  const action = resolveValue(useForm);
  const actionWithError = resolveValue(useFormWithError);
  let title = "Loaders";
  if (action) {
    title += ` - ACTION: ${action.name}`;
  }
  if (actionWithError) {
    title += ` - Error: ${actionWithError.name} ${actionWithError.message}`;
  }
  return {
    title,
    meta: [
      { content: date.toISOString(), name: "date" },
      { content: `${dep.nu}`, name: "dep" },
    ],
  };
};
