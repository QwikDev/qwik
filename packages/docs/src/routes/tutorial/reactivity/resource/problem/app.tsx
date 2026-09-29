// @ts-ignore: Unused import
import { component$, useSignal, useComputed$, type Signal } from '@qwik.dev/core';

// @ts-ignore: Unused declaration
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

  // Use useComputed$() to set up how the data is fetched from the server.
  // See the example for Fetching Data in the text on the left.
  // @ts-ignore: Unused declaration
  const reposResource = useComputed$<string[]>(({ abortSignal }) => {
    // We need a way to re-run fetching data whenever the `github.org` changes.
    // Reading githubOrg.value re-runs this function whenever it changes.
    const org = githubOrg.value;

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
        {/* Import $, Catch and Pending, then read the data inside them. */}
        {/* To help, here's the markup to display the data: */}
        {/* <Catch fallback$={$((error) => <div>Error: {error.message}</div>)}>
              <Pending fallback$={() => <div>Loading...</div>}>
                <Repos org={githubOrg} repos={reposResource} />
              </Pending>
            </Catch> */}
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
