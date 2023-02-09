import { component$, Resource } from '@builder.io/qwik';
import { action$, DocumentHead, Form, Link, loader$, z, zod$ } from '@builder.io/qwik-city';
import { delay } from '../../actions/login';

export const dateLoader = loader$(() => new Date('2021-01-01T00:00:00.000Z'));

export const dependencyLoader = loader$(async ({ params, redirect, json, getData }) => {
  const formData = await getData(form);
  await delay(100);
  if (params.id === 'redirect') {
    throw redirect(302, '/qwikcity-test/');
  } else if (params.id === 'redirect-welcome') {
    throw redirect(302, '/qwikcity-test/loaders/welcome/');
  } else if (params.id === 'json') {
    throw json(200, { nu: 42 });
  }
  return {
    nu: 42,
    name: formData?.name ?? params.id,
  };
});

export const asyncLoader = loader$(async ({ getData }) => {
  const p1 = getData(dateLoader);
  const p2 = getData(dependencyLoader);
  if (!(p1 instanceof Promise)) {
    throw new Error('Expected date to be a promise');
  }
  if (!(p2 instanceof Promise)) {
    throw new Error('Expected dep to be a promise');
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

export const slowLoader = loader$(async () => {
  await delay(500);
  return {
    foo: 123,
  };
});

export const realDateLoader = loader$(() => {
  return [new Date().toISOString()];
});

export const DateCmp = component$(() => {
  const date = realDateLoader.use();
  return <p id="real-date">real-date: {date.value[0]}</p>;
});

export default component$(() => {
  const date = dateLoader.use();
  const slow = slowLoader.use();
  const signal = asyncLoader.use();
  const action = form.use();
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
          <Link href="/qwikcity-test/loaders/redirect-welcome/" id="link-welcome">
            To Redirect /loaders/welcome/
          </Link>
        </li>
      </ul>
    </div>
  );
});

export const form = action$(
  async (stuff) => {
    return stuff;
  },
  zod$({
    name: z.string(),
  })
);

export const head: DocumentHead = ({ getData }) => {
  const date = getData(dateLoader);
  const dep = getData(dependencyLoader);
  const action = getData(form);
  let title = 'Loaders';
  if (action) {
    title += ` - ACTION: ${action.name}`;
  }
  return {
    title,
    meta: [
      { content: date.toISOString(), name: 'date' },
      { content: `${dep.nu}`, name: 'dep' },
    ],
  };
};
