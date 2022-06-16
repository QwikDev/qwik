import { component$ } from '@builder.io/qwik';

export const App = component$(() => {
  return (
    <div>
      <span>
        GitHub organization:
        <input value="Builder.io" />
      </span>
      <div>
        <ul>
          <li>
            <a href="https://github.com/builderio/qwik">Qwik</a>
          </li>
          <li>
            <a href="https://github.com/builderio/partytown">Partytown</a>
          </li>
        </ul>
      </div>
    </div>
  );
});
