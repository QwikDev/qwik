import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <main>
      <p>
        GitHub organization:
        <input value="BuilderIO" />
      </p>
      <section>
        <ul>
          <li>
            <a href="https://github.com/BuilderIO/qwik">Qwik</a>
          </li>
          <li>
            <a href="https://github.com/BuilderIO/partytown">Partytown</a>
          </li>
        </ul>
      </section>
    </main>
  );
});
