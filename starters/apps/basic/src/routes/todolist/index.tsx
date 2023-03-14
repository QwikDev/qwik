import { component$, useStylesScoped$ } from '@builder.io/qwik';
import {
  type DocumentHead,
  routeLoader$,
  globalAction$,
  zod$,
  z,
  Form,
} from '@builder.io/qwik-city';
import style from './todolist.css?inline';

interface ListItem {
  text: string;
}

export const list: ListItem[] = [];

export const useListLoader = routeLoader$(() => {
  return list;
});

export const useAddToListAction = globalAction$(
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
  useStylesScoped$(style);
  const list = useListLoader();
  const action = useAddToListAction();

  return (
    <>
      <div class="section">
        <div class="container center">
          <h1 class="hero">TODO List</h1>
        </div>
      </div>

      <div class="section bright">
        <div class="container center mh-300">
          {(list.value.length && (
            <ul class="list">
              {list.value.map((item, index) => (
                <li key={`items-${index}`}>{item.text}</li>
              ))}
            </ul>
          )) || <span class="no-content">No items found</span>}
        </div>
      </div>

      <div class="section">
        <div class="container center">
          <Form action={action} spaReset>
            <input type="text" name="text" required /> <button type="submit">Add item</button>
          </Form>

          <p class="hint">PS: This little app works even when JavaScript is disabled.</p>
        </div>
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Todo List',
};
