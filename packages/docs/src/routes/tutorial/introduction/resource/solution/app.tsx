/* eslint-disable no-console */
import {
  $,
  component$,
  Catch,
  Pending,
  useSignal,
  useComputed$,
  type Signal,
} from '@qwik.dev/core';

const Repos = component$((props: { org: Signal<string>; repos: Signal<string[]> }) => {
  return (
    <ul>
      {props.repos.value.map((repo) => (
        <li>
          <a href={`https://github.com/${props.org.value}/${repo}`}>{repo}</a>
        </li>
      ))}
    </ul>
  );
});

export default component$(() => {
  const githubOrg = useSignal('QwikDev');

  const repos = useComputed$<string[]>(({ abortSignal }) => {
    // Reading githubOrg.value re-runs this function whenever it changes.
    const org = githubOrg.value;

    // The abortSignal is automatically aborted when this function re-runs,
    // canceling any pending fetch requests.

    // Fetch the data and return the promises.
    return getRepositories(org, abortSignal);
  });

  console.log('Render');
  return (
    <main>
      <p>
        <label>
          GitHub username:
          <input bind:value={githubOrg} />
        </label>
      </p>
      <section>
        <Catch
          fallback$={$((error, reset) => (
            <>
              Error: {error.message} <button onClick$={() => reset()}>Retry</button>
            </>
          ))}
        >
          <Pending fallback$={() => <>Loading...</>}>
            <Repos org={githubOrg} repos={repos} />
          </Pending>
        </Catch>
      </section>
    </main>
  );
});

export async function getRepositories(
  username: string,
  abortSignal?: AbortSignal
): Promise<string[]> {
  console.log('FETCH', `https://api.github.com/users/${username}/repos`);
  const resp = await fetch(`https://api.github.com/users/${username}/repos`, {
    signal: abortSignal,
  });
  console.log('FETCH resolved');
  const json = await resp.json();
  return Array.isArray(json)
    ? json.map((repo: { name: string }) => repo.name)
    : Promise.reject(json);
}
