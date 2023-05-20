import { component$, useSignal } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import {
  MaterialSlider,
  MaterialButton,
  type ButtonComponentProps,
  MaterialTable,
  type TableUserData,
} from '~/integrations/angular';

export default component$(() => {
  const show = useSignal(false);
  const count = useSignal(0);
  const btnColor = useSignal<ButtonComponentProps['color']>('primary');
  const users = useSignal(Array.from({ length: 100 }, (_, k) => createNewUser(k + 1)));

  return (
    <div>
      <h1>
        Welcome to Qwik Angular<span class="lightning">⚡️</span>
      </h1>

      <div style="width: 80%; margin: 2rem auto">
        <select
          value={btnColor.value}
          onChange$={(ev) => {
            btnColor.value = (ev.target as any).value;
          }}
        >
          <option>warn</option>
          <option>accent</option>
          <option selected>primary</option>
        </select>

        <MaterialSlider
          client:visible
          sliderValue={count.value}
          sliderValueChanged$={(value: number) => {
            count.value = value;
          }}
        />

        <MaterialButton color={btnColor.value} host:onClick$={() => alert('click')}>
          Slider is {count.value}
        </MaterialButton>

        <MaterialButton
          color="accent"
          client:hover
          host:onClick$={() => {
            show.value = true;
          }}
        >
          Show table
        </MaterialButton>

        {show.value && <MaterialTable client:only users={users.value}></MaterialTable>}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Angular',
};

/** Builds and returns a new User. */
function createNewUser(id: number): TableUserData {
  /** Constants used to fill up our data base. */
  const FRUITS: string[] = [
    'blueberry',
    'lychee',
    'kiwi',
    'mango',
    'peach',
    'lime',
    'pomegranate',
    'pineapple',
  ];
  const NAMES: string[] = [
    'Maia',
    'Asher',
    'Olivia',
    'Atticus',
    'Amelia',
    'Jack',
    'Charlotte',
    'Theodore',
    'Isla',
    'Oliver',
    'Isabella',
    'Jasper',
    'Cora',
    'Levi',
    'Violet',
    'Arthur',
    'Mia',
    'Thomas',
    'Elizabeth',
  ];
  const name =
    NAMES[Math.round(Math.random() * (NAMES.length - 1))] +
    ' ' +
    NAMES[Math.round(Math.random() * (NAMES.length - 1))].charAt(0) +
    '.';

  return {
    id: id.toString(),
    name: name,
    progress: Math.round(Math.random() * 100).toString(),
    fruit: FRUITS[Math.round(Math.random() * (FRUITS.length - 1))],
  };
}
