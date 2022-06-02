import { component$ } from "@builder.io/qwik";

export const GitHubRepositories = component$(() => {
  return (
    <>
      <span>
        GitHub username:
        <input value="BuilderIO" />
      </span>
      <div>
        <ul>
          <li>
            <a href={`https://github.com/BuilderIO/qwik`}>Qwik</a>
          </li>
        </ul>
      </div>
    </>
  );
});
