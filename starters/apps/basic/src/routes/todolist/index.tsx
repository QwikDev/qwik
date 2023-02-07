import { component$ } from '@builder.io/qwik';
import { DocumentHead, loader$, action$, zod$, z, Form } from '@builder.io/qwik-city';

interface ListItem {
  text: string;
}

export const list: ListItem[] = [];

export const listLoader = loader$(() => {
  return list;
});

export const addToListAction = action$(
  (item) => {
    list.push(item);
    return {
      success: true,
    };
  },
  zod$({
    text: z.string(),
  })
);

export default component$(() => {
  const list = listLoader.use();
  const action = addToListAction.use();

  return (
    <>
      <h1>Form Action TODO list</h1>
      <ul>
        {list.value.map((item) => (
          <li>{item.text}</li>
        ))}
      </ul>
      <Form action={action} spaReset>
        <input type="text" name="text" required />
        <button type="submit">Add item</button>
      </Form>
      <p>This little app works even when JavaScript is disabled.</p>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Flower',
};
