import { component$ } from '@builder.io/qwik';
import { action$, loader$, Form } from '@builder.io/qwik-city';
import { data } from '../data';

export const getData = loader$(() => {
  return data;
});

export const otherAction = action$((form) => {
  const name = form.name as string;
  data.push(name);
  return { success: true };
});

export default component$(() => {
  const items = getData.use();
  const action = otherAction.use();
  return (
    <div>
      <ul id="issue2644-list">
        {items.value.map((x) => (
          <li>{x}</li>
        ))}
      </ul>
      <Form action={action}>
        <input name="name" id="issue2644-input" />
        <button id="issue2644-submit">Submit</button>
      </Form>
    </div>
  );
});
