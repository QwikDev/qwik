import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <main>
      <p>
        <label>
          GitHub organization:
          <input value="QwikDev" />
        </label>
      </p>
      <section>
        <ul>
          <li>
            <a href="https://github.com/QwikDev/qwik">Qwik</a>
          </li>
          <li>
            <a href="https://github.com/BuilderIO/partytown">Partytown</a>
          </li>
        </ul>
      </section>
    </main>
  );
});
