import { component$ } from '@builder.io/qwik';
import {
  type DocumentHead,
  routeLoader$,
  routeAction$,
  zod$,
  z,
  Form,
} from '@builder.io/qwik-city';
import styles from './todolist.module.css';

interface ListItem {
  text: string;
}

export const list: ListItem[] = [];

export const useListLoader = routeLoader$(() => {
  return list;
});

export const useAddToListAction = routeAction$(
  (item) => {
    list.push(item);
    return {
      success: true,
    };
  },
  zod$({
    text: z.string().trim().min(1),
  })
);

export default component$(() => {
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
            <ul class={styles.list}>
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

          <p class={styles.hint}>PS: This little app works even when JavaScript is disabled.</p>
        </div>
      </div>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Todo List',
};
